# ボスコニアンROMの合法的入手ルート調査

調査日: 2026-08-12（Web調査エージェントによる裏取り済み。法的助言ではない）

## 結論

**`bosco.zip`（MAME互換ROMイメージ）をそのままの形で合法的に配布しているルートは存在しない。**
合法的な選択肢は実質的に次の2つ:

1. **実基板を購入して自分で吸い出す**（私的複製の範囲で）
2. **公式製品を購入して遊ぶ**（ROM入手とは別物だが、合法的にプレイする手段としては最善）

## 推奨順位

| 順位 | ルート | 現実性 | 合法性の確度 | コスト |
|---|---|---|---|---|
| 1 | 実基板購入＋自己ダンプ | 中 | 高（自己保有・私的利用・非再配布の範囲） | 基板 約$175〜 ＋ EPROMリーダー数千円〜 |
| 2 | Arcade Archives BOSCONIAN 購入（PS4/Switch, $7.99） | 高 | 非常に高 | 低 |
| 3 | Namco Museum 50th Anniversary PC版から抽出 | 低 | **低（DRM回避＝著作権法30条1項2号で違法の可能性）** | 中 |
| 4 | MAME公式無料ROM / 権利者個人ライセンス | — | — | **対象外・制度なし（不可）** |

## 各ルートの詳細

### 1. 公式製品からの抽出 — 推奨できない

| 製品 | 収録形態 | ROM抽出 |
|---|---|---|
| Arcade Archives BOSCONIAN (HAMSTER, 2023) | アーケード版エミュレーション | 事例なし。暗号化パッケージ内、家庭用機のみ |
| Namco Museum 50th Anniversary (2005, PC版あり) | 原基板ROMをエミュレーション実行 | 独自形式＋StarForce DRM（Win7以降起動不可）。成功事例なし |
| NAMCO MUSEUM ARCHIVES (Steam) | **ファミコン移植版**（NES ROM） | 抽出容易だが**ボスコニアン非収録**、かつアーケード版ではない |
| Namco Museum Vol.1 (PS1) | ネイティブ移植（原ROMではない） | 対象外 |

- 日本法: 私的複製（著作権法30条）は原則許容だが、**30条1項2号により技術的保護手段（DRM/暗号化）の回避を伴う複製は私的複製でも違法**。家庭用パッケージやStarForce付きPC版からの抽出はこれに該当する可能性が高い。
- 米国法: DMCA 1201条のDRM回避禁止に抵触。各製品のEULAも抽出を禁止。

### 2. 実基板の購入とダンプ — 唯一の現実的な合法ルート

- **流通**: eBayで動作品ロジックPCBセットが流通（相場 約$175）。ヤフオク等国内でも時折出品あり。
- **プログラムROM/グラフィックROM/PROM**: EPROMリーダー（TL866II Plus / XGecu T48 等）で個人でも容易に吸い出せる。
- **最大の障壁 = カスタムMCU**（50XX/51XX/52XX/54XX）: 富士通MB88xx系4bitマイコンの**内蔵マスクROM**で、外部端子から読み出せない。吸い出しには**デキャップ（チップ開封＋ダイ顕微鏡解析）等の特殊手法**が必要で個人では非現実的。既にコミュニティ（CAPS0ff等）が解析済みで、その成果がMAMEに反映されている。実機修復用にはFPGA-DIL互換代替品も存在する。
- **法的位置づけ（日本）**: 自己所有基板からの私的使用目的の複製は30条に該当し得る（アーケードマスクROMは通常、技術的保護手段を持たないため2号の適用外の可能性が高い）。**ただし吸い出したデータの再配布・アップロードは違法。**

### 3. 権利者ライセンス — 制度なし

- バンダイナムコの「Catalog IP（Namco Creators' Program）」は新規ゲーム制作へのIP利用許諾であり、アーケードROM配布ライセンスではない（2018年3月終了）。
- 商用ライセンスは法人向けのみ。個人・開発者にクラシックアーケードROMを提供した公式事例は確認できず。

### 4. MAME公式の無料ROM — ボスコニアンは含まれない

- mamedev.org の許諾済み無料ROMは少数タイトル・非商用・同サイト配布限定であり、ボスコニアンは対象外。

## 本プロジェクトへの含意

- 開発中の自動テストは**合成ROM（自作ダミープログラム）**で行う（実ROM不要のテスト設計）。
- 実ROMでの受け入れ確認は、上記ルートでROMを用意できたユーザー自身の環境で行う。
- 本リポジトリおよび公開ページには**ROMを一切同梱しない**（`docs/feasibility-report.md` の法務節を参照）。

## 主要出典

- Arcade Archives BOSCONIAN: https://www.arcadearchives.com/en/title/aca-270/
- Bosconian PCB流通: https://www.ebay.com/itm/197677883339 / https://arcademade.com/pages/arcade-pcb-price-guide
- Namco カスタムMCUのデキャップ解析: https://forums.arcade-museum.com/threads/reverse-engineering-namco-customs-my-setup.204010/page-2
- Namco 5xxx 互換代替品: http://www.pin4.at/pro_custom_5xxx.php
- MAME ROMs FAQ: https://wiki.mamedev.org/index.php?title=FAQ%3AROMs
- 著作権法30条解説: https://chosakukenhou.jp/reproduction_for_private_use/
- Namco Catalog IP: https://pacman.fandom.com/wiki/Namco_Catalog_IP_games
