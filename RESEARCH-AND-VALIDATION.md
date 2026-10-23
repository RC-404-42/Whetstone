# 1.1.0 更新與驗證

- Windows 版改用 go-webview2 直接建立獨立視窗，以 Windows GUI 子系統編譯，不再呼叫外部瀏覽器。
- 新增原生「另存圖片」對話框；關閉主視窗會關閉內部資產服務。
- 新增力度 0～100、範圍 1～24 px 的自引導保邊平滑，可獨立使用，也可接在 SCUNet 後面。
- 同張、同範圍重用 AI 結果，調整去紋理參數時不必每次重跑神經網路。
- 合成的週期髒紋測試：舊快速濾波 RMSE 8.96，新平滑 1.59；主要輪廓對比 112.66 / 120。只代表這個人工範例，不代表使用者實際圖片。
- 小圖、單像素、奇數尺寸、零力度和透明 alpha 測試通過；box filter 與直接二維參考實作數值一致。
- Windows GUI / 原生另存對話框無實機環境可驗證；GPU 仍未實測。

依賴資料：
- https://github.com/jchv/go-webview2
- https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution

以下保留第一版的公開前端研究與基線測試，數字和啟動方式描述屬於 1.0.0，不適用於新版桌面視窗。

---

# 公開前端研究與驗證紀錄

檢視日期：2026-10-23。只讀取未登入可取得的 HTML、JavaScript 和公開模型資料，沒有繞過付費、驗證碼或帳號權限。網站前端不等於完整後端原始碼。磨石的介面、分塊、混合、匯出及本機啟動器為獨立製作，沒有打包或複製這四站的前端程式。

## 四站的差別

| 服務 | 從公開資料確認的內容 | 無法確認的部分 |
| --- | --- | --- |
| [denoise.pro](https://denoise.pro/) | 公開前端會呼叫伺服器的 `/api/process-image`，再查詢工作狀態。前端有 Gemini 錯誤訊息及相關成本顯示字串。 | 不能由這些字串斷定後端目前使用的確切模型、提示詞或處理流程。可能有生成式圖片重修，不能假定只是一個本機濾鏡。 |
| [imgmend](https://imgmend.com/) | 前端把圖片表單送往 `/api/denoise`；文案標示 Real-ESRGAN，另有免費次數及付費驗證流程。 | 真正的後端推論程式與模型權重沒有從前端取得，無法獨立驗證文案與後端完全相符。 |
| [Teamzlab](https://tool.teamzlab.com/image/ai-image-noise-remover/) | 公開內嵌程式使用 `Xenova/swin2SR-compressed-sr-x4-48`，先把輸入最長邊限制在 512px，再執行模型及額外保邊濾波；AI 失敗時退回純濾波。 | 這其實包含壓縮影像超解析度重建，輸入被縮小後再放大不能視為保留全部原始細節；此處沒有完整執行其線上服務。 |
| [Callculation](https://callculation.com/ai-tools/ai-image-denoiser/) | 公開 worker 載入 SCUNet real-GAN ONNX，使用 128px 區塊、16px 上下文及批次處理；可用 WebGPU，另有 WASM 路徑。 | 沒有以付費站為標準做同圖畫質比較。磨石採用的 SCUNet real-PSNR 權重不同，因此不能宣稱效果完全相同。 |

「收費」本身不能證明只是套殼：部分站有伺服器推論成本、儲存及維運；另一些確實可以在使用者裝置上執行。對本機工具而言，可以直接採用公開授權模型，避免依賴其會員與付費後端。

## 本版模型與來源

- SCUNet 原作：[cszn/SCUNet](https://github.com/cszn/SCUNet)，Apache-2.0。
- ONNX 模型轉換：[Heliosoph/scunet-onnx](https://huggingface.co/Heliosoph/scunet-onnx)，使用 `scunet_color_real_psnr.onnx` 及其 external data；原模型卡已附帶。
- 推論引擎：[Microsoft ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/)，固定為 1.24.3；JS、MJS、WASM 檔隨附。
- Go 1.24.7 標準函式庫負責嵌入資產、本機 HTTP 介面和啟動瀏覽器。
- 下載檔的 SHA256 紀錄見 `ASSETS-SHA256.txt`。

## 已完成驗證

1. 在 Chromium 中真正執行 SCUNet CPU / WASM，完成 192×192 局部預覽，以及 640×480 整圖的 12 區塊推論。
2. 整圖 AI 處理約 95.6 秒，匯出的 PNG 維持 640×480。這是特定測試環境的數字，不是速度保證。
3. 內建人工加噪範例的平滑漸層區域，輸入顆粒標準差約 15，80% 效果混合後對理論乾淨漸層的 RMSE 約 3.15。這只衡量合成範例，不能推廣成所有圖片的畫質指標。
4. 快速模式在相同尺寸範例約 1.7 秒，WebP 和 JPG 也已實際匯出。
5. 停止處理會終止背景 worker，介面可再次操作。
6. 程式層以恆等模型測試 1×1、1×257、191×127、193×195、513×257：確認反射補邊、每個像素都被涵蓋、接合誤差不超過 1 色階、透明度逐位元組保留。這是分塊流程測試，並非另一組真實 AI 推論。
7. 快速濾波的合成均勻區域噪聲 RMSE 從 16.03 降到 2.97，半透明像素的 alpha 未改變。
8. Go 程式通過格式與靜態檢查，成功交叉編譯為 Windows x64 PE 執行檔。
9. 相同啟動器的 Linux 編譯版本已測試：只監聽 loopback、提供 HTML / 模型 / WASM、設定正確 WASM MIME 與隔離標頭、拒絕外部 Host / Origin。
10. 本機 PWA 匯出已逐檔驗證 SHA256，並確認不會悄悄覆寫既有檔案。

## 驗證限制

- 沒有可用的實體 Windows 桌面，因此尚未在 Windows 上啟動 EXE；不能把交叉編譯成功當成 Windows 實機驗證。
- 目前測試瀏覽器沒有可用 WebGPU；GPU 加速路徑尚未實測。
- 瀏覽器自動審核拒絕測試 PNG 的檔案選取匯入，表示未取得上傳授權。沒有改用其他瀏覽器方法繞過；透明與特殊尺寸改以不涉及檔案匯入的本機程式測試。一般檔案選取、拖曳與貼上仍需在使用者裝置上實測。
- PWA 可部署資產、manifest、service worker 與離線快取流程已附帶；尚未在公開 HTTPS 網站與手機上實測安裝。
- 沒有宣稱與四站同等畫質；尤其生成式重修可能與本機降噪有本質差異。
