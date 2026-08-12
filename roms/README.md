# ROMs are not included / ROMは同梱されません

本プロジェクトはボスコニアンのROMイメージを一切含みません。ROMイメージは著作物であり、
権利者（バンダイナムコエンターテインメント）の明示的な許諾なしに配布できません。

In order to use this recreation, you need to provide the correct ROMs yourself.
ROMセット（MAME形式の `bosco.zip` など）はご自身で合法的に用意してください。

## 使い方

- **ブラウザ**: ページを開き、手持ちのROMセット（zip）をドラッグ＆ドロップしてください。
  ファイルはブラウザ内でのみ処理され、どこにもアップロードされません。
- **ローカル開発**: このディレクトリに `bosco.zip` を置くと、開発サーバが自動読み込みします。
  このディレクトリの中身は `.gitignore` により**コミットされません**。

## 対応ROMセット

MAME準拠の以下のセット（Full Non-Merged推奨）:
`bosco` (version 5) / `bosco3` / `bosco1` / `bosco1o` / `boscomd` / `boscomdo`

カスタムMCU（50XX/51XX/52XX/54XX）のファームウェア `50xx.bin` `51xx.bin` `52xx.bin`
`54xx.bin` も必要です（Non-Mergedセットには通常同梱されています）。
