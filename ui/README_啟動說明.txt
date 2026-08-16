F446 馬達控制台 - 啟動說明
====================================

【啟動】
  雙擊 start_dev.bat
  會開啟兩個視窗：
    [F446 Bridge]    ws://localhost:8080   （模擬馬達節點）
    [F446 Frontend]  http://127.0.0.1:5173 （操作介面，用瀏覽器開啟）

【停止】
  直接關閉兩個視窗，或雙擊 stop_dev.bat

【手動啟動】（進階）
  終端機 1: cd ui\bridge  →  npm run sim
  終端機 2: cd ui\frontend →  npm run dev

【注意】
  start_dev.bat 為純英文內容（避免 Windows 命令列編碼問題），
  本檔案為 UTF-8 編碼，請用記事本/VS Code 開啟。
