# ボスコニアン ハードウェア仕様（実装リファレンス）

出典はすべて `mamedev/mame` master（**BSD-3-Clause**）:
`src/mame/namco/galaga.cpp`（© Nicola Salmoria 他）、`src/mame/namco/bosco.cpp`、
`src/mame/namco/starfield_05xx.cpp`（© Robert Hildinger）、`src/devices/sound/namco.cpp`、
`src/mame/namco/namco50/51/52/54/06.cpp`。
クロスチェック用の独立実装: `MiSTer-devel/Arcade-Bosconian_MiSTer` `rtl/bosconian.vhd`
（GPLv2 — **仕様確認のみに使用し、コードは移植しない**）。

## 基本構成

| 項目 | 値 |
|---|---|
| マスタークロック | 18.432 MHz |
| CPU | Z80 ×3（maincpu / sub / sub2）、各 18.432M÷6 = **3.072 MHz** |
| ピクセルクロック | 18.432M÷3 = 6.144 MHz |
| 画面 | 表示 288×224、総ドット 384×264 → リフレッシュ **60.606 Hz** |
| 可視走査線 | 16〜239（`set_raw(MASTER_CLOCK/3, 384, 0, 288, 264, 16, 224+16)`） |
| MAME側の量子 | 6000 Hz インターリーブ（実機は07XX/08XXによる時分割） |

## メモリマップ（3CPU共通、`bosco_map`）

```
0000-3fff ROM（CPUごとに別内容。main=16KB, sub=8KB, sub2=4KB）
6800-6807 R  DSW（1bitずつ8アドレスに分散）
6800-681f W  Namco WSG サウンドレジスタ（pacman_sound_w 形式）
6820-6827 W  misclatch LS259（CPUボード3C）:
             Q0=IRQ1クリア Q1=IRQ2クリア Q2=NMI有効
             Q3=sub/sub2のRESET（+50xx_1/51xx/54xxのreset）
6830      W  ウォッチドッグリセット（8 vblank以内に叩く）
7000-70ff RW 06xx_0 データ（ch0=51XX, ch2=50XX_1, ch3=54XX）
7100      RW 06xx_0 コントロール
7800-7fff RAM 共有RAM（2KB）
8000-8fff W  videoram 4KB（+スプライト/レーダーレジスタが埋め込み）
9000-90ff RW 06xx_1 データ（ch0=50XX_2, ch1=52XX）… subcpu側
9100      RW 06xx_1 コントロール
9800-980f W  bosco_radarattr
9810      W  scrollX / 9820 W scrollY（BGタイルマップ）
9830      W  starcontrol: bit0-2=星X速度, bit3-5=星Y速度
9840      W  starclr（任意値の書き込みで星空ON）
9870-9877 W  videolatch LS259（ビデオボード1B）:
             Q0=画面反転(反転出力) Q4/Q5=星空バンク選択 Q7=50xx_2/52xxリセット
```

- 06xx_0 のクロック: 18.432M/6/64、06xx_1: 18.432M/6/512（本来はhblank）
- vblank で: IRQ発火（main/sub）、51XXにvblank通知、星空スクロール速度・バンク・有効化を更新

## videoram 内部レイアウト（0x8000起点のオフセット）

```
0x0000-0x03ff FGタイル番号（レーダー帯 8×32、mapper: col + (row<<5)）
0x0400-0x07ff BGタイル番号（プレイフィールド 32×32）
0x0800-0x0bff FG属性 / 0x0c00-0x0fff BG属性
  属性: bit0-5=カラー(0-63), bit6-7=flipX/flipY（TILE_FLIPX と XOR）
スプライト（videoramに重畳、6個 = 0x0c バイト×2面）:
  spriteram  = videoram[0x03d4..]: [0]=bit0 flipX, bit1 flipY, bit2-7 タイル番号
               [1]=X座標(-2補正)
  spriteram2 = videoram[0x0bd4..]: [0]=Y座標(240-y), [1]=bit0-5 カラー
弾/レーダードット（12個, offs 4..0x0f）:
  radarx = videoram[0x03f0..], radary = videoram[0x0bf0..]
  x = radarx[offs] + ((~radarattr[offs] & 0x01) << 8) - 2
  y = 251 - radary[offs]
  ドット形状 = ((radarattr[offs] & 0x0e) >> 1) ^ 0x07（gfx3の8種）
```

## 描画順（`screen_update_bosco`）

1. 黒でクリア
2. 星空（bg_clip = 左28文字ぶんのみ）
3. スプライト（bg_clip 内）
4. BGタイルマップ（bg_clip、scrollX/Y 適用、group=カラーで透明制御 0x1f）
5. FGタイルマップ（fg_clip = 右端 28*8〜）
6. 弾/ドット（全域）
7. **レーダー帯を3px左シフト**: H offset 221-223 がスキップされる実機挙動の再現
   （x=224..287 を x-3 へコピーし元を黒に）

反転画面時は左右のクリップが入れ替わり、スプライトX+31、弾x-1/y+2 の補正。

## グラフィックフォーマット

```
charlayout_2bpp (gfx1, 8×8, 2bpp, 16バイト/char):
  planes {0,4}, x = [8*8+0..3, 0..3](=右半分が先), y = 0,8,16,...
spritelayout_bosco (gfx2, 16×16, 2bpp, 64バイト/sprite):
  planes {0,4}
  x = [8*8..+3, 16*8..+3, 24*8..+3, 0..3]  ※Galagaとx順序が異なる
  y = [0..7行 = 0,8,..,56, 8..15行 = 32*8,...]
dotlayout (gfx3, 4×4, 8個, planes {5,6,7}):
  x = 0,8,16,24 / y = 0,32,64,96（16バイト/dot）
```

## パレット（カラーPROM + 抵抗ネットワーク）

- コア32色: PROM `bos1-6.6b` の各バイトから
  R = bit0-2 × (1000/470/220Ω加重), G = bit3-5 × 同, B = bit6-7 × (470/220Ω加重)
- 星64色: インデックスの bit0-1→R, bit2-3→G, bit4-5→B（470/220Ω、1000Ωプルダウン）
- キャラ用ペン: `LUT[i] & 0x0f | 0x10`（i=0..255）/ スプライト用: `LUT[i] & 0x0f`
- 弾: 色28-31を逆順で4本
- 星空はコア32色の後ろに64色（インデックス32〜95）

## 星空（05XX、実チップ解析済み）

- 内部16bit LFSR。総数256星 = 64星×4バンク、常時2バンクがアクティブ
  （videolatch Q4, Q5|2 で選択）
- スクロール速度: starcontrol の bit0-2（X）/bit3-5（Y）
- `starclr` への書き込みで有効化（`m_bosco_starclr`）
- 実装は `starfield_05xx.cpp` の LFSR ロジックをそのまま移植する
  （STARFIELD_Y_OFFSET_BOSCO, STARFIELD_X_LIMIT_BOSCO の定数に注意）

## カスタムチップ（すべて富士通MB88xx実MCU + ファームROM）

| チップ | MCU | ファーム | クロック | 役割 |
|---|---|---|---|---|
| 50XX ×2 | MB8842 | `50xx.bin` 2KB | 1.536MHz(内部÷6) | スコア演算/プロテクト |
| 51XX | MB8843 | `51xx.bin` 1KB | 同 | 入力(IN0/IN1 4bit×4)・コイン管理 |
| 52XX | MB8843 | `52xx.bin` 1KB | 同 | 音声ROM再生。555外部クロック(33k/10k/0.0047µF) |
| 54XX | MB8844 | `54xx.bin` 1KB | 同 | ノイズ→ディスクリート回路（爆発音等） |
| 06XX ×2 | (ロジック) | — | /64, /512 | CPU⇔5xXXバスI/F。**NMI生成タイミング要注意** |

**06XXタイミングの罠**: 元プログラム 0x0BB1 に `ex af,af'` でコマンドが壊れる
バグがあり、06XXのNMIが十分速く来ることが前提になっている（galaga.cpp のNotes）。

## サウンド（3系統）

1. **WSG 3ch 波形テーブル**（18.432M/6/32 = 96kHz）: 波形PROM `bos1-1.1d`(+`bos1-2.5c`)、
   レジスタは 0x6800-0x681f。ゲイン 0.90×10/16
2. **52XX デジタル音声**: `bos1_9/10/11` 計12KB（"Blast off" 等）
3. **54XX + ディスクリート**: 爆発音・ショット音。**世界的に完全再現例なし**
   （MiSTer coreも Known Issues として未解決）— 近似実装とする

## MAME自身が記録する未解決点

- 水平解像度は285かもしれない（TODO。現行288、PCB映像では右ボーダーがやや広い）
- 波形PROMに `prom.1d` / `bosco.spr` の2ダンプがあり音楽が大きく異なる。
  MAME採用は `prom.1d`（他Namco作品と類似のため）

## ROMセット（version 5 = `bosco`）

`src/rom/romdb.ts`（`tools/gen-romdb.py` で galaga.cpp から自動生成）を参照。
6リビジョン: bosco / bosco3 / bosco1 / bosco1o / boscomd / boscomdo（各19ファイル、計50,272バイト＋MCUファーム4本）

## 起動シーケンス（実機修理ログより・Galaga系共通）

```
電源投入 → 白ブロック画面 → グリッド等の中間画面
→ CPU1 が RAMテスト → "RAM OK"
→ misclatch Q3 で sub/sub2 のRESET解放 → 各CPUがROMチェック→共有RAMに結果
→ "ROM OK" → アトラクトモード
```
エミュレーション実装ではこのシーケンスが**そのまま実行される**こと自体が
フェーズ2〜3の受け入れテストになる。
