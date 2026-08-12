// GENERATED FILE — do not edit by hand. Regenerate with tools/gen-romdb.py.
// Source of truth: mamedev/mame src/mame/namco/galaga.cpp and
// namco50/51/52/54.cpp (BSD-3-Clause, copyright-holders: Nicola Salmoria
// and others). Extracted 2026-08-12.

export interface RomFile {
  file: string;
  offset: number;
  size: number;
  crc: string; // CRC32, lowercase hex, no 0x
  sha1: string;
}

export interface RomRegion {
  name: string;
  size: number;
  roms: RomFile[];
}

export type RomSetName =
  "bosco" |
  "bosco3" |
  "bosco1" |
  "bosco1o" |
  "boscomd" |
  "boscomdo";

export const ROM_SETS: Record<RomSetName, RomRegion[]> = {
  "bosco": [
    {
      "name": "maincpu",
      "size": 65536,
      "roms": [
        {
          "file": "bos5_1.3p",
          "offset": 0,
          "size": 4096,
          "crc": "b1482ad1",
          "sha1": "32d0402fc4882cae2c3655f24087f9f1911f99c1"
        },
        {
          "file": "bos5_2.3m",
          "offset": 4096,
          "size": 4096,
          "crc": "e0828ef8",
          "sha1": "2633c7518bf0918f33dac8fbed7aa7053a4793f0"
        },
        {
          "file": "bos5_3.2m",
          "offset": 8192,
          "size": 4096,
          "crc": "229edd51",
          "sha1": "6e34837b1d18637b94b3e772ff1b61ffe70e8fcc"
        },
        {
          "file": "bos5_4.2l",
          "offset": 12288,
          "size": 4096,
          "crc": "928a39a0",
          "sha1": "dfc5a7ff62a0eabc900b43ef6b8e86e4d46125fe"
        }
      ]
    },
    {
      "name": "sub",
      "size": 65536,
      "roms": [
        {
          "file": "bos5_5.3f",
          "offset": 0,
          "size": 4096,
          "crc": "84f7c1ea",
          "sha1": "53a1242490575938fca9e738546c93edf82ad7d3"
        },
        {
          "file": "bos5_6.3j",
          "offset": 4096,
          "size": 4096,
          "crc": "7fa34d5e",
          "sha1": "c99feb051ab62ef3f7278a411938cd09e731fc19"
        }
      ]
    },
    {
      "name": "sub2",
      "size": 65536,
      "roms": [
        {
          "file": "bos1_7.2c",
          "offset": 0,
          "size": 4096,
          "crc": "d45a4911",
          "sha1": "547236adca9174f5cc0ec05b9649618bb92ba630"
        }
      ]
    },
    {
      "name": "gfx1",
      "size": 4096,
      "roms": [
        {
          "file": "bos1_14.5d",
          "offset": 0,
          "size": 4096,
          "crc": "a956d3c5",
          "sha1": "c5a9d7b1f9b4acda8fb9762414e085cb5fb80c9e"
        }
      ]
    },
    {
      "name": "gfx2",
      "size": 4096,
      "roms": [
        {
          "file": "bos1_13.5e",
          "offset": 0,
          "size": 4096,
          "crc": "e869219c",
          "sha1": "425614cd0642743a82ef9c1aada29774a92203ea"
        }
      ]
    },
    {
      "name": "gfx3",
      "size": 256,
      "roms": [
        {
          "file": "bos1-4.2r",
          "offset": 0,
          "size": 256,
          "crc": "9b69b543",
          "sha1": "47af3f67e50794e839b74fe61197af2228084efd"
        }
      ]
    },
    {
      "name": "proms",
      "size": 608,
      "roms": [
        {
          "file": "bos1-6.6b",
          "offset": 0,
          "size": 32,
          "crc": "d2b96fb0",
          "sha1": "54c100ec9d173d7dd48a453ebed5f625053cb6e0"
        },
        {
          "file": "bos1-5.4m",
          "offset": 32,
          "size": 256,
          "crc": "4e15d59c",
          "sha1": "3542ead6421d169c3569e121ec2be304e108787c"
        },
        {
          "file": "bos1-3.2d",
          "offset": 288,
          "size": 32,
          "crc": "b88d5ba9",
          "sha1": "7b97a38a540b7ca4b7d9ae338ec38b9b1a337846"
        },
        {
          "file": "bos1-7.7h",
          "offset": 320,
          "size": 32,
          "crc": "87d61353",
          "sha1": "c7493e52662c921625676a4a4e8cf4371bd938b7"
        }
      ]
    },
    {
      "name": "namco",
      "size": 512,
      "roms": [
        {
          "file": "bos1-1.1d",
          "offset": 0,
          "size": 256,
          "crc": "de2316c6",
          "sha1": "0e55c56046331888d1d3f0d9823d2ceb203e7d3f"
        },
        {
          "file": "bos1-2.5c",
          "offset": 256,
          "size": 256,
          "crc": "77245b66",
          "sha1": "0c4d0bee858b97632411c440bea6948a74759746"
        }
      ]
    },
    {
      "name": "52xx",
      "size": 12288,
      "roms": [
        {
          "file": "bos1_9.5n",
          "offset": 0,
          "size": 4096,
          "crc": "09acc978",
          "sha1": "2b264aaeb6eba70ad91593413dca733990e5467b"
        },
        {
          "file": "bos1_10.5m",
          "offset": 4096,
          "size": 4096,
          "crc": "e571e959",
          "sha1": "9c81d7bec73bc605f7dd9a089171b0f34c4bb09a"
        },
        {
          "file": "bos1_11.5k",
          "offset": 8192,
          "size": 4096,
          "crc": "17ac9511",
          "sha1": "266f3fae90d2fe38d109096d352863a52b379899"
        }
      ]
    }
  ],
  "bosco3": [
    {
      "name": "maincpu",
      "size": 65536,
      "roms": [
        {
          "file": "bos3_1.3n",
          "offset": 0,
          "size": 4096,
          "crc": "96021267",
          "sha1": "bd49b0caabcccf9df45a272d767456a4fc8a7c07"
        },
        {
          "file": "bos1_2.3m",
          "offset": 4096,
          "size": 4096,
          "crc": "2d8f3ebe",
          "sha1": "75de1cba7531ae4bf7fbbef7b8e37b9fec4ed0d0"
        },
        {
          "file": "bos1_3.3l",
          "offset": 8192,
          "size": 4096,
          "crc": "c80ccfa5",
          "sha1": "f2bbec2ea9846d4601f06c0b4242744447a88fda"
        },
        {
          "file": "bos1_4b.3k",
          "offset": 12288,
          "size": 4096,
          "crc": "a3f7f4ab",
          "sha1": "eb26184311bae0767c7a5593926e6eadcbcb680e"
        }
      ]
    },
    {
      "name": "sub",
      "size": 65536,
      "roms": [
        {
          "file": "bos1_5c.3j",
          "offset": 0,
          "size": 4096,
          "crc": "a7c8e432",
          "sha1": "3607be75daa10f1f98dbfd9e600c5ba513130d44"
        },
        {
          "file": "bos3_6.3h",
          "offset": 4096,
          "size": 4096,
          "crc": "4543cf82",
          "sha1": "50ad7d1ab6694eb8fab88d0fa79ee04f6984f3ca"
        }
      ]
    },
    {
      "name": "sub2",
      "size": 65536,
      "roms": [
        {
          "file": "bos1_7.3e",
          "offset": 0,
          "size": 4096,
          "crc": "d45a4911",
          "sha1": "547236adca9174f5cc0ec05b9649618bb92ba630"
        }
      ]
    },
    {
      "name": "gfx1",
      "size": 4096,
      "roms": [
        {
          "file": "bos1_14.5d",
          "offset": 0,
          "size": 4096,
          "crc": "a956d3c5",
          "sha1": "c5a9d7b1f9b4acda8fb9762414e085cb5fb80c9e"
        }
      ]
    },
    {
      "name": "gfx2",
      "size": 4096,
      "roms": [
        {
          "file": "bos1_13.5e",
          "offset": 0,
          "size": 4096,
          "crc": "e869219c",
          "sha1": "425614cd0642743a82ef9c1aada29774a92203ea"
        }
      ]
    },
    {
      "name": "gfx3",
      "size": 256,
      "roms": [
        {
          "file": "bos1-4.2r",
          "offset": 0,
          "size": 256,
          "crc": "9b69b543",
          "sha1": "47af3f67e50794e839b74fe61197af2228084efd"
        }
      ]
    },
    {
      "name": "proms",
      "size": 608,
      "roms": [
        {
          "file": "bos1-6.6b",
          "offset": 0,
          "size": 32,
          "crc": "d2b96fb0",
          "sha1": "54c100ec9d173d7dd48a453ebed5f625053cb6e0"
        },
        {
          "file": "bos1-5.4m",
          "offset": 32,
          "size": 256,
          "crc": "4e15d59c",
          "sha1": "3542ead6421d169c3569e121ec2be304e108787c"
        },
        {
          "file": "bos1-3.2d",
          "offset": 288,
          "size": 32,
          "crc": "b88d5ba9",
          "sha1": "7b97a38a540b7ca4b7d9ae338ec38b9b1a337846"
        },
        {
          "file": "bos1-7.7h",
          "offset": 320,
          "size": 32,
          "crc": "87d61353",
          "sha1": "c7493e52662c921625676a4a4e8cf4371bd938b7"
        }
      ]
    },
    {
      "name": "namco",
      "size": 512,
      "roms": [
        {
          "file": "bos1-1.1d",
          "offset": 0,
          "size": 256,
          "crc": "de2316c6",
          "sha1": "0e55c56046331888d1d3f0d9823d2ceb203e7d3f"
        },
        {
          "file": "bos1-2.5c",
          "offset": 256,
          "size": 256,
          "crc": "77245b66",
          "sha1": "0c4d0bee858b97632411c440bea6948a74759746"
        }
      ]
    },
    {
      "name": "52xx",
      "size": 12288,
      "roms": [
        {
          "file": "bos1_9.5n",
          "offset": 0,
          "size": 4096,
          "crc": "09acc978",
          "sha1": "2b264aaeb6eba70ad91593413dca733990e5467b"
        },
        {
          "file": "bos1_10.5m",
          "offset": 4096,
          "size": 4096,
          "crc": "e571e959",
          "sha1": "9c81d7bec73bc605f7dd9a089171b0f34c4bb09a"
        },
        {
          "file": "bos1_11.5k",
          "offset": 8192,
          "size": 4096,
          "crc": "17ac9511",
          "sha1": "266f3fae90d2fe38d109096d352863a52b379899"
        }
      ]
    }
  ],
  "bosco1": [
    {
      "name": "maincpu",
      "size": 65536,
      "roms": [
        {
          "file": "bos1_1.3n",
          "offset": 0,
          "size": 4096,
          "crc": "0d9920e7",
          "sha1": "e7633233f603ccb5b7a970ed5b58ef361ef2c94e"
        },
        {
          "file": "bos1_2.3m",
          "offset": 4096,
          "size": 4096,
          "crc": "2d8f3ebe",
          "sha1": "75de1cba7531ae4bf7fbbef7b8e37b9fec4ed0d0"
        },
        {
          "file": "bos1_3.3l",
          "offset": 8192,
          "size": 4096,
          "crc": "c80ccfa5",
          "sha1": "f2bbec2ea9846d4601f06c0b4242744447a88fda"
        },
        {
          "file": "bos1_4b.3k",
          "offset": 12288,
          "size": 4096,
          "crc": "a3f7f4ab",
          "sha1": "eb26184311bae0767c7a5593926e6eadcbcb680e"
        }
      ]
    },
    {
      "name": "sub",
      "size": 65536,
      "roms": [
        {
          "file": "bos1_5c.3j",
          "offset": 0,
          "size": 4096,
          "crc": "a7c8e432",
          "sha1": "3607be75daa10f1f98dbfd9e600c5ba513130d44"
        },
        {
          "file": "bos1_6.3h",
          "offset": 4096,
          "size": 4096,
          "crc": "31b8c648",
          "sha1": "de0db24d385d2361ec989bf32388df8202ad535c"
        }
      ]
    },
    {
      "name": "sub2",
      "size": 65536,
      "roms": [
        {
          "file": "bos1_7.3e",
          "offset": 0,
          "size": 4096,
          "crc": "d45a4911",
          "sha1": "547236adca9174f5cc0ec05b9649618bb92ba630"
        }
      ]
    },
    {
      "name": "gfx1",
      "size": 4096,
      "roms": [
        {
          "file": "bos1_14.5d",
          "offset": 0,
          "size": 4096,
          "crc": "a956d3c5",
          "sha1": "c5a9d7b1f9b4acda8fb9762414e085cb5fb80c9e"
        }
      ]
    },
    {
      "name": "gfx2",
      "size": 4096,
      "roms": [
        {
          "file": "bos1_13.5e",
          "offset": 0,
          "size": 4096,
          "crc": "e869219c",
          "sha1": "425614cd0642743a82ef9c1aada29774a92203ea"
        }
      ]
    },
    {
      "name": "gfx3",
      "size": 256,
      "roms": [
        {
          "file": "bos1-4.2r",
          "offset": 0,
          "size": 256,
          "crc": "9b69b543",
          "sha1": "47af3f67e50794e839b74fe61197af2228084efd"
        }
      ]
    },
    {
      "name": "proms",
      "size": 608,
      "roms": [
        {
          "file": "bos1-6.6b",
          "offset": 0,
          "size": 32,
          "crc": "d2b96fb0",
          "sha1": "54c100ec9d173d7dd48a453ebed5f625053cb6e0"
        },
        {
          "file": "bos1-5.4m",
          "offset": 32,
          "size": 256,
          "crc": "4e15d59c",
          "sha1": "3542ead6421d169c3569e121ec2be304e108787c"
        },
        {
          "file": "bos1-3.2d",
          "offset": 288,
          "size": 32,
          "crc": "b88d5ba9",
          "sha1": "7b97a38a540b7ca4b7d9ae338ec38b9b1a337846"
        },
        {
          "file": "bos1-7.7h",
          "offset": 320,
          "size": 32,
          "crc": "87d61353",
          "sha1": "c7493e52662c921625676a4a4e8cf4371bd938b7"
        }
      ]
    },
    {
      "name": "namco",
      "size": 512,
      "roms": [
        {
          "file": "bos1-1.1d",
          "offset": 0,
          "size": 256,
          "crc": "de2316c6",
          "sha1": "0e55c56046331888d1d3f0d9823d2ceb203e7d3f"
        },
        {
          "file": "bos1-2.5c",
          "offset": 256,
          "size": 256,
          "crc": "77245b66",
          "sha1": "0c4d0bee858b97632411c440bea6948a74759746"
        }
      ]
    },
    {
      "name": "52xx",
      "size": 12288,
      "roms": [
        {
          "file": "bos1_9.5n",
          "offset": 0,
          "size": 4096,
          "crc": "09acc978",
          "sha1": "2b264aaeb6eba70ad91593413dca733990e5467b"
        },
        {
          "file": "bos1_10.5m",
          "offset": 4096,
          "size": 4096,
          "crc": "e571e959",
          "sha1": "9c81d7bec73bc605f7dd9a089171b0f34c4bb09a"
        },
        {
          "file": "bos1_11.5k",
          "offset": 8192,
          "size": 4096,
          "crc": "17ac9511",
          "sha1": "266f3fae90d2fe38d109096d352863a52b379899"
        }
      ]
    }
  ],
  "bosco1o": [
    {
      "name": "maincpu",
      "size": 65536,
      "roms": [
        {
          "file": "bos1_1.3n",
          "offset": 0,
          "size": 4096,
          "crc": "0d9920e7",
          "sha1": "e7633233f603ccb5b7a970ed5b58ef361ef2c94e"
        },
        {
          "file": "bos1_2.3m",
          "offset": 4096,
          "size": 4096,
          "crc": "2d8f3ebe",
          "sha1": "75de1cba7531ae4bf7fbbef7b8e37b9fec4ed0d0"
        },
        {
          "file": "bos1_3.3l",
          "offset": 8192,
          "size": 4096,
          "crc": "c80ccfa5",
          "sha1": "f2bbec2ea9846d4601f06c0b4242744447a88fda"
        },
        {
          "file": "bos1_4.3k",
          "offset": 12288,
          "size": 4096,
          "crc": "7ebea2b8",
          "sha1": "92fc66526ed77f3efd947b7d321b255aba4a0140"
        }
      ]
    },
    {
      "name": "sub",
      "size": 65536,
      "roms": [
        {
          "file": "bos1_5b.3j",
          "offset": 0,
          "size": 4096,
          "crc": "3d6955a8",
          "sha1": "f89860d74865da5ced2f5b2196bdaa8eeb5e2322"
        },
        {
          "file": "bos1_6.3h",
          "offset": 4096,
          "size": 4096,
          "crc": "31b8c648",
          "sha1": "de0db24d385d2361ec989bf32388df8202ad535c"
        }
      ]
    },
    {
      "name": "sub2",
      "size": 65536,
      "roms": [
        {
          "file": "bos1_7.3e",
          "offset": 0,
          "size": 4096,
          "crc": "d45a4911",
          "sha1": "547236adca9174f5cc0ec05b9649618bb92ba630"
        }
      ]
    },
    {
      "name": "gfx1",
      "size": 4096,
      "roms": [
        {
          "file": "bos1_14.5d",
          "offset": 0,
          "size": 4096,
          "crc": "a956d3c5",
          "sha1": "c5a9d7b1f9b4acda8fb9762414e085cb5fb80c9e"
        }
      ]
    },
    {
      "name": "gfx2",
      "size": 4096,
      "roms": [
        {
          "file": "bos1_13.5e",
          "offset": 0,
          "size": 4096,
          "crc": "e869219c",
          "sha1": "425614cd0642743a82ef9c1aada29774a92203ea"
        }
      ]
    },
    {
      "name": "gfx3",
      "size": 256,
      "roms": [
        {
          "file": "bos1-4.2r",
          "offset": 0,
          "size": 256,
          "crc": "9b69b543",
          "sha1": "47af3f67e50794e839b74fe61197af2228084efd"
        }
      ]
    },
    {
      "name": "proms",
      "size": 608,
      "roms": [
        {
          "file": "bos1-6.6b",
          "offset": 0,
          "size": 32,
          "crc": "d2b96fb0",
          "sha1": "54c100ec9d173d7dd48a453ebed5f625053cb6e0"
        },
        {
          "file": "bos1-5.4m",
          "offset": 32,
          "size": 256,
          "crc": "4e15d59c",
          "sha1": "3542ead6421d169c3569e121ec2be304e108787c"
        },
        {
          "file": "bos1-3.2d",
          "offset": 288,
          "size": 32,
          "crc": "b88d5ba9",
          "sha1": "7b97a38a540b7ca4b7d9ae338ec38b9b1a337846"
        },
        {
          "file": "bos1-7.7h",
          "offset": 320,
          "size": 32,
          "crc": "87d61353",
          "sha1": "c7493e52662c921625676a4a4e8cf4371bd938b7"
        }
      ]
    },
    {
      "name": "namco",
      "size": 512,
      "roms": [
        {
          "file": "bos1-1.1d",
          "offset": 0,
          "size": 256,
          "crc": "de2316c6",
          "sha1": "0e55c56046331888d1d3f0d9823d2ceb203e7d3f"
        },
        {
          "file": "bos1-2.5c",
          "offset": 256,
          "size": 256,
          "crc": "77245b66",
          "sha1": "0c4d0bee858b97632411c440bea6948a74759746"
        }
      ]
    },
    {
      "name": "52xx",
      "size": 12288,
      "roms": [
        {
          "file": "bos1_9.5n",
          "offset": 0,
          "size": 4096,
          "crc": "09acc978",
          "sha1": "2b264aaeb6eba70ad91593413dca733990e5467b"
        },
        {
          "file": "bos1_10.5m",
          "offset": 4096,
          "size": 4096,
          "crc": "e571e959",
          "sha1": "9c81d7bec73bc605f7dd9a089171b0f34c4bb09a"
        },
        {
          "file": "bos1_11.5k",
          "offset": 8192,
          "size": 4096,
          "crc": "17ac9511",
          "sha1": "266f3fae90d2fe38d109096d352863a52b379899"
        }
      ]
    }
  ],
  "boscomd": [
    {
      "name": "maincpu",
      "size": 65536,
      "roms": [
        {
          "file": "3n",
          "offset": 0,
          "size": 4096,
          "crc": "441b501a",
          "sha1": "7b4921ff40b3c56950fd32aa0ec5563b02a00929"
        },
        {
          "file": "3m",
          "offset": 4096,
          "size": 4096,
          "crc": "a3c5c7ef",
          "sha1": "70a095a8dbca857245a70404f803916f519e0cbc"
        },
        {
          "file": "3l",
          "offset": 8192,
          "size": 4096,
          "crc": "6ca9a0cf",
          "sha1": "8f70e29beae921e63cd65689a618ca678dd14614"
        },
        {
          "file": "3k",
          "offset": 12288,
          "size": 4096,
          "crc": "d83bacc5",
          "sha1": "cf2fbfa81dabb9b6bcf436d61992e705723776fb"
        }
      ]
    },
    {
      "name": "sub",
      "size": 65536,
      "roms": [
        {
          "file": "3j",
          "offset": 0,
          "size": 4096,
          "crc": "4374e39a",
          "sha1": "7571fd5961f49a0e9ba4301ddd0aca52e94e2f8b"
        },
        {
          "file": "3h",
          "offset": 4096,
          "size": 4096,
          "crc": "04e9fcef",
          "sha1": "2115a9718d511854848704e2693f9efa1c80a307"
        }
      ]
    },
    {
      "name": "sub2",
      "size": 65536,
      "roms": [
        {
          "file": "2900.3e",
          "offset": 0,
          "size": 4096,
          "crc": "d45a4911",
          "sha1": "547236adca9174f5cc0ec05b9649618bb92ba630"
        }
      ]
    },
    {
      "name": "gfx1",
      "size": 4096,
      "roms": [
        {
          "file": "5300.5d",
          "offset": 0,
          "size": 4096,
          "crc": "a956d3c5",
          "sha1": "c5a9d7b1f9b4acda8fb9762414e085cb5fb80c9e"
        }
      ]
    },
    {
      "name": "gfx2",
      "size": 4096,
      "roms": [
        {
          "file": "5200.5e",
          "offset": 0,
          "size": 4096,
          "crc": "e869219c",
          "sha1": "425614cd0642743a82ef9c1aada29774a92203ea"
        }
      ]
    },
    {
      "name": "gfx3",
      "size": 256,
      "roms": [
        {
          "file": "prom.2d",
          "offset": 0,
          "size": 256,
          "crc": "9b69b543",
          "sha1": "47af3f67e50794e839b74fe61197af2228084efd"
        }
      ]
    },
    {
      "name": "proms",
      "size": 608,
      "roms": [
        {
          "file": "bosco.6b",
          "offset": 0,
          "size": 32,
          "crc": "d2b96fb0",
          "sha1": "54c100ec9d173d7dd48a453ebed5f625053cb6e0"
        },
        {
          "file": "bosco.4m",
          "offset": 32,
          "size": 256,
          "crc": "4e15d59c",
          "sha1": "3542ead6421d169c3569e121ec2be304e108787c"
        },
        {
          "file": "prom.2r",
          "offset": 288,
          "size": 32,
          "crc": "b88d5ba9",
          "sha1": "7b97a38a540b7ca4b7d9ae338ec38b9b1a337846"
        },
        {
          "file": "prom.7h",
          "offset": 320,
          "size": 32,
          "crc": "87d61353",
          "sha1": "c7493e52662c921625676a4a4e8cf4371bd938b7"
        }
      ]
    },
    {
      "name": "namco",
      "size": 512,
      "roms": [
        {
          "file": "prom.1d",
          "offset": 0,
          "size": 256,
          "crc": "de2316c6",
          "sha1": "0e55c56046331888d1d3f0d9823d2ceb203e7d3f"
        },
        {
          "file": "prom.5c",
          "offset": 256,
          "size": 256,
          "crc": "77245b66",
          "sha1": "0c4d0bee858b97632411c440bea6948a74759746"
        }
      ]
    },
    {
      "name": "52xx",
      "size": 12288,
      "roms": [
        {
          "file": "4900.5n",
          "offset": 0,
          "size": 4096,
          "crc": "09acc978",
          "sha1": "2b264aaeb6eba70ad91593413dca733990e5467b"
        },
        {
          "file": "5000.5m",
          "offset": 4096,
          "size": 4096,
          "crc": "e571e959",
          "sha1": "9c81d7bec73bc605f7dd9a089171b0f34c4bb09a"
        },
        {
          "file": "5100.5l",
          "offset": 8192,
          "size": 4096,
          "crc": "17ac9511",
          "sha1": "266f3fae90d2fe38d109096d352863a52b379899"
        }
      ]
    },
    {
      "name": "pal_vidbd",
      "size": 1,
      "roms": []
    }
  ],
  "boscomdo": [
    {
      "name": "maincpu",
      "size": 65536,
      "roms": [
        {
          "file": "2300.3n",
          "offset": 0,
          "size": 4096,
          "crc": "db6128b0",
          "sha1": "ddd285f7e00d5e58ab9b15838528e0020d47fcd2"
        },
        {
          "file": "2400.3m",
          "offset": 4096,
          "size": 4096,
          "crc": "86907614",
          "sha1": "3295ab6c5171a069875c2239b3325296c1df6031"
        },
        {
          "file": "2500.3l",
          "offset": 8192,
          "size": 4096,
          "crc": "a21fae11",
          "sha1": "dff38d90ee30558274d2d399edc3281c2ef5cb69"
        },
        {
          "file": "2600.3k",
          "offset": 12288,
          "size": 4096,
          "crc": "11d6ae23",
          "sha1": "f2f72f5c777b684f7ffd53b9c034560211113499"
        }
      ]
    },
    {
      "name": "sub",
      "size": 65536,
      "roms": [
        {
          "file": "2700.3j",
          "offset": 0,
          "size": 4096,
          "crc": "7254e65e",
          "sha1": "c2ee29fcb5173e8d46a80a8a1b931a53dbdeae66"
        },
        {
          "file": "2800.3h",
          "offset": 4096,
          "size": 4096,
          "crc": "31b8c648",
          "sha1": "de0db24d385d2361ec989bf32388df8202ad535c"
        }
      ]
    },
    {
      "name": "sub2",
      "size": 65536,
      "roms": [
        {
          "file": "2900.3e",
          "offset": 0,
          "size": 4096,
          "crc": "d45a4911",
          "sha1": "547236adca9174f5cc0ec05b9649618bb92ba630"
        }
      ]
    },
    {
      "name": "gfx1",
      "size": 4096,
      "roms": [
        {
          "file": "5300.5d",
          "offset": 0,
          "size": 4096,
          "crc": "a956d3c5",
          "sha1": "c5a9d7b1f9b4acda8fb9762414e085cb5fb80c9e"
        }
      ]
    },
    {
      "name": "gfx2",
      "size": 4096,
      "roms": [
        {
          "file": "5200.5e",
          "offset": 0,
          "size": 4096,
          "crc": "e869219c",
          "sha1": "425614cd0642743a82ef9c1aada29774a92203ea"
        }
      ]
    },
    {
      "name": "gfx3",
      "size": 256,
      "roms": [
        {
          "file": "prom.2d",
          "offset": 0,
          "size": 256,
          "crc": "9b69b543",
          "sha1": "47af3f67e50794e839b74fe61197af2228084efd"
        }
      ]
    },
    {
      "name": "proms",
      "size": 608,
      "roms": [
        {
          "file": "bosco.6b",
          "offset": 0,
          "size": 32,
          "crc": "d2b96fb0",
          "sha1": "54c100ec9d173d7dd48a453ebed5f625053cb6e0"
        },
        {
          "file": "bosco.4m",
          "offset": 32,
          "size": 256,
          "crc": "4e15d59c",
          "sha1": "3542ead6421d169c3569e121ec2be304e108787c"
        },
        {
          "file": "prom.2r",
          "offset": 288,
          "size": 32,
          "crc": "b88d5ba9",
          "sha1": "7b97a38a540b7ca4b7d9ae338ec38b9b1a337846"
        },
        {
          "file": "prom.7h",
          "offset": 320,
          "size": 32,
          "crc": "87d61353",
          "sha1": "c7493e52662c921625676a4a4e8cf4371bd938b7"
        }
      ]
    },
    {
      "name": "namco",
      "size": 512,
      "roms": [
        {
          "file": "prom.1d",
          "offset": 0,
          "size": 256,
          "crc": "de2316c6",
          "sha1": "0e55c56046331888d1d3f0d9823d2ceb203e7d3f"
        },
        {
          "file": "prom.5c",
          "offset": 256,
          "size": 256,
          "crc": "77245b66",
          "sha1": "0c4d0bee858b97632411c440bea6948a74759746"
        }
      ]
    },
    {
      "name": "52xx",
      "size": 12288,
      "roms": [
        {
          "file": "4900.5n",
          "offset": 0,
          "size": 4096,
          "crc": "09acc978",
          "sha1": "2b264aaeb6eba70ad91593413dca733990e5467b"
        },
        {
          "file": "5000.5m",
          "offset": 4096,
          "size": 4096,
          "crc": "e571e959",
          "sha1": "9c81d7bec73bc605f7dd9a089171b0f34c4bb09a"
        },
        {
          "file": "5100.5l",
          "offset": 8192,
          "size": 4096,
          "crc": "17ac9511",
          "sha1": "266f3fae90d2fe38d109096d352863a52b379899"
        }
      ]
    },
    {
      "name": "pal_vidbd",
      "size": 1,
      "roms": []
    }
  ]
};

export const MCU_ROMS: Record<string, RomFile> = {
  "50xx": {
    "file": "50xx.bin",
    "offset": 0,
    "size": 2048,
    "crc": "a0acbaf7",
    "sha1": "f03c79451e73b3a93c1591cdb27fedc9f130508d"
  },
  "51xx": {
    "file": "51xx.bin",
    "offset": 0,
    "size": 1024,
    "crc": "c2f57ef8",
    "sha1": "50de79e0d6a76bda95ffb02fcce369a79e6abfec"
  },
  "52xx": {
    "file": "52xx.bin",
    "offset": 0,
    "size": 1024,
    "crc": "3257d11e",
    "sha1": "4883b2fdbc99eb7b9906357fcc53915842c2c186"
  },
  "54xx": {
    "file": "54xx.bin",
    "offset": 0,
    "size": 1024,
    "crc": "ee7357e0",
    "sha1": "01bdf984a49e8d0cc8761b2cc162fd6434d5afbe"
  }
};
