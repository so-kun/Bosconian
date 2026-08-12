# 作業記録（worklog）

全フェーズの経過・判断・修正内容をここに時系列で記録する。
（運用ルール: フェーズごとに中断してユーザーへ報告 / 不明点は自己判断せず確認）

---

## 2026-08-12 — 調査 & フェーズ0

### 調査（実装前）

- deep-research ワークフロー（検索エージェント102体・出典20件・主張40件を3票制で裏取り）
  ＋ MAME ソース直読を実施。結果は `docs/feasibility-report.md` に集約。
- 主要な確定事項:
  - ハード仕様は MAME（BSD-3-Clause）と MiSTer core（GPLv2）の独立2実装が一致 → 確定扱い
  - サウンドは3系統（WSG / 52XX音声 / 54XX+ディスクリート）。54XX系は世界的に完全再現例なし
  - ボスコニアン専用の公開逆アセンブルは存在しない（Galagaには完全な前例 neiderm/arcade あり）
  - 起動画面は「白ブロック→グリッド→RAM OK→ROM OK→アトラクト」（実機修理ログ）
  - ROM同梱は明確にNG（米〜2076年/日〜2051年保護、バンダイナムコは権利行使中）
    → MiSTer/Galagino と同じ「ROM非同梱・ユーザー持ち込み」分離モデルを採用
- ユーザー判断（AskUserQuestion で確認済み）:
  - ROMの扱い → 「MAMEなどから参照できないか調査」→ 調査結果: MAME はROMを配布して
    おらず参照経路にならない。本環境は archive.org 遮断。→ ユーザー持ち込み方式で実装
  - 実装アプローチ → 逆アセンブル結果からの再実装を優先
  - 成果物 → 調査レポート＋実装計画
- 計画承認時のユーザー指示（本worklogの運用ルールの根拠）:
  1. フェーズごとに中断して報告する
  2. 修正内容・経過をすべて後から参照できるように記録する
  3. 不明点は自己判断せず必ず確認する
- 採用アプローチ: **(b)自前ハードウェアエミュレータを土台に (c)逆アセンブル再実装を載せる
  ハイブリッド**。エミュレータが起動画面要件を満たし、かつ再実装の検証環境(トレース比較)になる。

### フェーズ0: 環境構築・ROMローダ・検証

- スキャフォールド: Vite 6 + TypeScript 5 (strict) + Vitest 3。依存は `fflate` のみ
- `tools/gen-romdb.py`: MAME `galaga.cpp` + `namco50/51/52/54.cpp` から
  6リビジョン分のROM定義（ファイル名/オフセット/サイズ/CRC32/SHA1）と
  MCUファーム4本の定義を抽出し `src/rom/romdb.ts` を自動生成
  - 検証: 全6セットとも 19ファイル・50,272バイト、プログラム部は 4KB×7 = 28KB
- `src/rom/crc32.ts`: CRC-32(IEEE) + WebCrypto SHA-1
- `src/rom/loader.ts`: zip展開(fflate) → **CRC優先マッチ**（merged setのリネームに耐性）、
  名前一致のみのファイルは bad_hash として報告。リビジョン自動判定（一致数スコア）。
  領域を実機サイズで組み立て（隙間は 0xff）。SHA-1 二重検証
- `index.html` + `src/main.ts` + `src/ui/romPanel.ts`: ドラッグ&ドロップUI、
  検証レポート表（領域/ファイル/サイズ/CRC/状態）、ROM非同梱の注意書き。
  開発用に `roms/bosco.zip`（gitignore済み）の自動読み込み（zipマジック確認付き）
- `roms/README.md`: ROM非同梱ポリシー（MiSTer準拠の文面）
- テスト 13件全パス / `npm run build` 成功:
  - CRC32/SHA1 の既知解答テスト
  - ローダの missing / bad_hash / 領域組み立て / セット判定
  - romdb の整合性（19ファイル、28KBプログラム、領域内収まり）
- **未検証（実ROMが必要なため）**: 実ROMでの complete=true 判定。ユーザーの手元での
  動作確認をフェーズ0報告時に依頼する

### フェーズ0の残課題・次フェーズへの引き継ぎ

- ライセンス選択（MIT or GPLv2）を要確認 → フェーズ0報告時に質問
  → **ユーザー回答: MIT に決定**（LICENSE 追加。MiSTer VHDL のコードは一切移植しない前提）
- 検証用ROMの有無を質問 → **ユーザー回答: 「取得方法も含めて調査して」**
  → 合法的入手ルート（公式製品からの抽出可能性・実基板ダンプ・ライセンス）の調査を実施
  （結果は docs/rom-acquisition.md に記録予定）。用意できるまでの自動テストは合成ROM
  （自作ダミープログラム）で代替する方針
- フェーズ1: Z80コア（zexall検証）、メモリマップ、3CPU調停、LS259、ウォッチドッグ、IRQ/NMI

---

## 2026-08-12 — フェーズ1: Z80コア＋マシン骨格

### ROM入手ルート調査（ユーザー依頼分）完了

- 結果を `docs/rom-acquisition.md` に記録。要旨: MAME互換ROMの合法配布ルートは存在しない。
  現実解は (1)実基板購入＋自己ダンプ（私的複製の範囲、ただしカスタムMCU内蔵ROMは個人では
  吸い出し不可）、(2)Arcade Archives購入（プレイのみ）。公式製品からの抽出はDRM回避
  （著作権法30条1項2号）に該当する可能性が高く推奨できない。
- 含意: 開発中の自動テストは合成ROM（自作ダミープログラム）で行う設計にした。

### Z80コア（src/core/z80.ts）

- **自作を選択**（計画では「既存MITライブラリ or 自作」だった。理由: フェーズ5-6の
  トレース比較にフックが必要なこと、依存の品質検証コストより自作＋zex検証が確実なこと）
- 実装範囲: 全公式命令＋非公式命令（SLL、IXH/IXL/IYH/IYL、DDCBのレジスタコピー、
  ED無効=2NOP）、非公式フラグ（X/Y、MEMPTR/WZ経由の BIT n,(HL)）、Rレジスタ、
  IM0/1/2、NMI、EI遅延、HALT。命令粒度のサイクルカウント
- 検証: 単体テスト12件＋zexdoc/zexall（Frank Cringleの命令エクササイザ、実チップ由来
  CRC照合）。zexバイナリはGPLのためコミットせず `tools/fetch-testroms.sh` で取得
  （anotherlin/z80emu ミラー、`npm run test:zex`）
- **バグ修正1件**: ADDのオーバーフローフラグ計算が `~(v^r)&(a^r)` になっていた
  （正: `~(a^v)&(a^r)`）。単体テストが検出。
  もう1件のテスト失敗はテスト側の誤り（実Z80はリセット後A=0xffであることを失念）

### マシン骨格（src/machine/bosco.ts）

- メモリマップ全実装（bosco_map準拠）: ROM/DSW/WSGレジスタ/misclatch/watchdog/
  06xx窓(スタブ)/共有RAM/videoram/radarattr/scroll/starcontrol/starclr/videolatch
- 3CPU調停: スキャンライン単位（192サイクル/ライン）で命令粒度ラウンドロビン
  （MAMEの6kHz量子より細かい）
- LS259 misclatch: Q0/Q1=IRQマスク&クリア、Q2=NMI許可（反転）、Q3=sub/sub2リセット
  （立ち上がりで解放）。videolatch: Q0=画面反転（反転）、Q4/Q5/Q7はフェーズ2/3へ
- vblank IRQ（ライン240、レベルトリガ）、sub2へのNMI（ライン64/192、
  cpu3_interrupt_callback準拠）、ウォッチドッグ（8 vblankで全体リセット）
- DSW読み（1bit×8アドレス分散、bit0=DSWB/bit1=DSWA）
- 統合テスト7件（合成ROM使用）: サブCPUリセットゲート、共有RAM相互可視性、
  vblank IRQ配送/ack、ウォッチドッグ発火、DSW、ROM書き込み無視、ラッチ類

### テスト状況

- 通常スイート: 32件パス（+zex 2件は環境変数ゲート）
- zexdoc/zexall: バックグラウンドで実行中（数十分規模）。結果はこの下に追記する

### zexdoc/zexall 結果（フェーズ1完了ゲート）

- **1回目: 134グループ中132 OK、`<adc,sbc> hl,<rr>` のみCRC不一致**（zexdoc/zexall両方）
  → 原因: `adc16` のオーバーフローフラグが add8 と同種の論理誤り
  （`~(x^y)&(x^r)` とすべきを `(x^r)&~(y^r)` にしていた）。単体テストでは16bit ADCの
  オーバーフローケースを書いていなかったため素通りしていた。回帰テスト2件追加
- **2回目（修正後）: zexdoc/zexall とも 134/134 全グループ OK、"Tests complete"**
  実行時間 約265秒（両方合計、Node 22）
- 補足: vitest が「1 error」を報告するが、これは長時間同期実行によるワーカーRPC
  タイムアウト（テスト基盤側の既知問題）。`--pool=forks` を test:zex に追加して回避
- **フェーズ1完了条件クリア**: zex全パス＋合成ROMでCPU1（3CPU）が正常動作
