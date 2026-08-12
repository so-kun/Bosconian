# Bosconian Recreation

ナムコのアーケードゲーム「ボスコニアン」(1981) をWebブラウザ上で再現するプロジェクト。

実機基板（Namco Galaga系ハードウェア: Z80×3 + Namcoカスタムチップ群）をTypeScriptで
エミュレートし、電源投入時のセルフテスト（RAM OK / ROM OK）からアトラクトモード、
実プレイまでを再現することを目標とする。その土台の上で、ROMの逆アセンブル解析による
ネイティブ再実装を段階的に進める。

## ROMについて

**本リポジトリにROMイメージは一切含まれません。** ROMイメージは著作物であり、権利者の
明示的な許諾なしに配布できません。利用にはご自身で合法的に用意したMAME形式のROMセット
（`bosco.zip` 等）が必要です。詳細は [roms/README.md](roms/README.md) を参照。

## 開発

```sh
npm install
npm run dev    # 開発サーバ
npm test       # ユニットテスト
npm run build  # 型チェック + プロダクションビルド
```

## ドキュメント

- [docs/feasibility-report.md](docs/feasibility-report.md) — 実現可能性の調査レポートと実装計画（フェーズ0〜6）
- [docs/hardware.md](docs/hardware.md) — ハードウェア仕様の実装リファレンス
- [docs/worklog.md](docs/worklog.md) — 作業記録（全フェーズの経過・判断を時系列で記録）

## 進捗

- [x] 調査・実装計画
- [x] フェーズ0: 環境構築・ROMローダ・CRC/SHA1検証
- [ ] フェーズ1: Z80コア・メモリマップ・3CPU調停
- [ ] フェーズ2: ビデオ（タイル/スプライト/星空）— "RAM OK / ROM OK" 表示
- [ ] フェーズ3: カスタムチップ（MB88xx）・入力 — アトラクト完走/プレイ可能
- [ ] フェーズ4: サウンド（WSG / 52XX音声 / 54XXディスクリート近似）
- [ ] フェーズ5: 逆アセンブル解析（敵AI・編隊・スコアリング）
- [ ] フェーズ6: ネイティブ再実装＋トレース一致検証

## 主要参考資料

- [mamedev/mame](https://github.com/mamedev/mame) `src/mame/namco/`（BSD-3-Clause）—
  ハードウェア仕様の一次資料
- [MiSTer-devel/Arcade-Bosconian_MiSTer](https://github.com/MiSTer-devel/Arcade-Bosconian_MiSTer)
  （GPLv2）— 独立実装によるクロスチェック（コードは流用しない）
