//go:build windows

package main

import (
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf16"
	"unsafe"

	webview "github.com/jchv/go-webview2"
	"github.com/jchv/go-webview2/webviewloader"
	"golang.org/x/sys/windows"
)

var user32 = windows.NewLazySystemDLL("user32.dll")
var messageBox = user32.NewProc("MessageBoxW")
var getSaveFileName = windows.NewLazySystemDLL("comdlg32.dll").NewProc("GetSaveFileNameW")
var dialogError = windows.NewLazySystemDLL("comdlg32.dll").NewProc("CommDlgExtendedError")

type openFileName struct {
	Size            uint32
	Owner           uintptr
	Instance        uintptr
	Filter          *uint16
	CustomFilter    *uint16
	MaxCustomFilter uint32
	FilterIndex     uint32
	File            *uint16
	MaxFile         uint32
	FileTitle       *uint16
	MaxFileTitle    uint32
	InitialDir      *uint16
	Title           *uint16
	Flags           uint32
	FileOffset      uint16
	FileExtension   uint16
	DefaultExt      *uint16
	CustomData      uintptr
	Hook            uintptr
	TemplateName    *uint16
	Reserved        unsafe.Pointer
	Reserved2       uint32
	FlagsEx         uint32
}

func nativeError(text string) {
	messageBox.Call(0, uintptr(unsafe.Pointer(windows.StringToUTF16Ptr(text))), uintptr(unsafe.Pointer(windows.StringToUTF16Ptr("磨石 Whetstone"))), 0x10)
}

func saveNative(owner uintptr, name, payload string) (string, error) {
	if len(payload) > 180000000 {
		return "", errors.New("圖片過大，無法儲存")
	}
	content, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		return "", errors.New("圖片資料無法解碼")
	}
	ext := strings.ToLower(filepath.Ext(name))
	if ext != ".png" && ext != ".jpg" && ext != ".webp" {
		return "", errors.New("不支援的儲存格式")
	}
	filter := utf16.Encode([]rune("圖片 (*" + ext + ")\x00*" + ext + "\x00所有檔案\x00*.*\x00\x00"))
	buffer := make([]uint16, 32768)
	copy(buffer, windows.StringToUTF16(filepath.Base(name)))
	ofn := openFileName{Owner: owner, File: &buffer[0], MaxFile: uint32(len(buffer)), Filter: &filter[0], FilterIndex: 1, Title: windows.StringToUTF16Ptr("另存清理後的圖片"), DefaultExt: windows.StringToUTF16Ptr(strings.TrimPrefix(ext, ".")), Flags: 0x00000002 | 0x00000800 | 0x00000008 | 0x00080000}
	ofn.Size = uint32(unsafe.Sizeof(ofn))
	ok, _, _ := getSaveFileName.Call(uintptr(unsafe.Pointer(&ofn)))
	if ok == 0 {
		code, _, _ := dialogError.Call()
		if code != 0 {
			return "", fmt.Errorf("無法開啟儲存視窗 (0x%X)", code)
		}
		return "", nil
	}
	destination := windows.UTF16ToString(buffer)
	if err := os.WriteFile(destination, content, 0644); err != nil {
		return "", err
	}
	return destination, nil
}

func runDesktop(url string) {
	if dpi := user32.NewProc("SetProcessDpiAwarenessContext"); dpi.Find() == nil {
		dpi.Call(^uintptr(3))
	}

	version, err := webviewloader.GetInstalledVersion()
	if err != nil || version == "" {
		nativeError("找不到 Microsoft Edge WebView2 Runtime。\n\n請先安裝微軟官方 WebView2 Evergreen Runtime，再重新開啟磨石。\n\n本程式不會自動下載、不會改開外部瀏覽器。\n官方下載：https://developer.microsoft.com/microsoft-edge/webview2/")
		return
	}
	cache, err := os.UserCacheDir()
	if err != nil {
		nativeError(err.Error())
		return
	}
	view := webview.NewWithOptions(webview.WebViewOptions{Debug: false, AutoFocus: true, DataPath: filepath.Join(cache, "Whetstone", "WebView2"), WindowOptions: webview.WindowOptions{Title: "磨石 Whetstone 1.1.0", Width: 1320, Height: 940, IconId: 1, Center: true}})
	if view == nil {
		nativeError("無法建立程式視窗，請確認 WebView2 Runtime 已完整安裝。")
		return
	}
	defer view.Destroy()
	view.SetSize(900, 660, webview.HintMin)
	dark := int32(1)
	windows.NewLazySystemDLL("dwmapi.dll").NewProc("DwmSetWindowAttribute").Call(uintptr(view.Window()), 20, uintptr(unsafe.Pointer(&dark)), 4)
	err = view.Bind("whetstoneSaveImage", func(name, payload string) (string, error) { return saveNative(uintptr(view.Window()), name, payload) })
	if err != nil {
		nativeError(err.Error())
		return
	}
	view.Init("window.whetstoneDesktop=true;")
	view.Navigate(url)
	view.Run()
}
