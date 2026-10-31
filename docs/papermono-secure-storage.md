# Secure storage on a PaperMono

For the owner to decide. **No build burns an eFuse or enables flash encryption**; only the commands marked
IRREVERSIBLE below do, and nothing runs them for you. None of the encrypted modes has run on a device yet: see
[Not yet known](#not-yet-known).

## The problem

`services.secureWrite` keeps values in NVS, by default on plain flash. In an app that's the session's tokens. Anyone
holding the device can read them with `esptool read-flash` and `strings`, without opening it. The Wi-Fi password and
the server's address are compiled into the firmware image, which is plain too.

## The choices

Chosen at build time by `ONE_SECURE_STORAGE`. Each encrypted build has its own `build-secure` directory and
`sdkconfig-secure`.

| | Burns | A flash dump gives the tokens? | Holder reflashes their own firmware? | Wi-Fi password in the image |
|---|---|---|---|---|
| unset (today) | nothing | yes, by `strings` | not needed | readable |
| `build-key` | nothing | yes, with some work: the key is in the same flash | not needed | readable |
| `hmac` | one eFuse key block, by hand | **no** | **yes: their firmware can ask the HMAC peripheral for the same keys** | readable |
| flash encryption in release mode, plus `hmac` or its own keys (not built) | several eFuses | no | no: plain firmware won't run | encrypted |

Is NVS encryption possible without burning anything? **Yes, and that's `build-key`, but it isn't protection from
someone who knows what they're doing.** Whatever a device can read with no eFuse, whoever holds it can read too. It
stops a look through a dump for text, and it lets the encrypted path be tried on the real device at no risk. Use it for that.

`hmac` alone protects against a dump, or a flash chip taken out. It doesn't protect against someone with a USB cable and
time. Only flash encryption in release mode, usually with secure boot, does.

Whichever is chosen: an account's owner can end a lost device's session in Conta, on Sessões e dispositivos, and
that works today.

**Recommendation:** try `build-key` on the device first. Stay there while this is a development device with no one
else's data, and decide on flash encryption before a device leaves your hands with real accounts.

## How it's built

- `CONFIG_NVS_ENCRYPTION=y` with `CONFIG_NVS_SEC_KEY_PROTECT_NONE=y` (`tools/sdkconfig.secure-storage`). This matters:
  ESP-IDF's usual choice, the HMAC scheme, **burns a new random eFuse key on its own the first time
  `nvs_flash_init` finds none.** With "none" that code isn't in the image.
- The app gets the keys itself (`oneNetStorageKeys`, `src/backends/papermono_net.ab`) and calls `nvs_flash_secure_init`.
  In `hmac` it checks the block's purpose, and with no key it **fails closed**: no storage, no Wi-Fi, and the serial
  log says `secure storage needs its eFuse key`. It never falls back to plain.
- It derives the same keys as ESP-IDF's HMAC scheme, so a later move to that scheme keeps the data.
- The first start on encrypted NVS **erases the partition**, so old plain tokens don't stay on flash. The device
  returns to the QR. A wrong or new key does the same.
- `build-key`: `build/papermono/storage.key` (0600, not in git). It's kept between builds; deleting `build/` means
  signing in again.

## Trying `build-key` (reversible, burns nothing)

```
make flash-papermono ONE_SECURE_STORAGE=build-key NOVAKIND_SERVER=https://name
```

Then, in the shell of step 1 below, dump the partition and look for a token (it should count 0):

```
python -m esptool --port /dev/ttyACM0 read-flash 0x9000 0x6000 nvs.bin && strings nvs.bin | grep -c accessToken
```

To go back, flash without `ONE_SECURE_STORAGE`, and sign in again.

## Moving to `hmac`

1. Read-only: check the block is free. It must say `KEY_PURPOSE_5 = USER` and `BLOCK_KEY5` all zeros.
   ```
   nix-shell ../abla-embedded/shell.nix --run "steam-run bash"
   source ~/.cache/abla-embedded/esp-idf-v6.0.2/export.sh
   python -m espefuse --chip esp32s3 --port /dev/ttyACM0 summary
   ```
2. Flash the build before there's a key, burning nothing. It should log `secure storage needs its eFuse key` and show no connection:
   ```
   make flash-papermono ONE_SECURE_STORAGE=hmac NOVAKIND_SERVER=https://name
   ```
3. **IRREVERSIBLE.** Burn the key. This can't be undone, read back or changed:
   ```
   head -c 32 /dev/urandom > hmac.key
   python -m espefuse --chip esp32s3 --port /dev/ttyACM0 burn-key BLOCK_KEY5 hmac.key HMAC_UP
   shred -u hmac.key
   ```
   `make test-papermono-storage` tries this command on espefuse's virtual chip.
4. Reset. It erases NVS once, and shows the QR. Sign in, then dump as above: no token.

Risks of step 3:

- It uses one of six key blocks for good, and block 5 can't be used for anything else afterwards. Flash encryption
  and secure boot need others, so five are left.
- It doesn't brick the device: a plain build ignores the key. Only the tokens depend on it, and losing them means signing in again.
- It doesn't protect against reflashing (see the table), so it may buy less than it costs.

## Flash encryption (not built, and not to be tried casually)

Enabling it is `CONFIG_SECURE_FLASH_ENC_ENABLED=y` and a first boot that burns the eFuses by itself. What to weigh:

- **Release mode is the only one that protects, and it's permanent.** USB flashing of plain images stops for good;
  updates need OTA or pre-encrypted images, and a bad image can leave the device unrecoverable.
- Development mode can be reflashed, but a holder can read it back the same way, and the number of plain/encrypted
  switches is limited by an eFuse counter (three).
- All code runs through the flash cache, and on the S3 the PSRAM holding the Abla heap would be encrypted too. Expect the
  panel and the app to slow down; this hasn't been measured. Don't do it to the only device before measuring on a spare.
- The bootloader grows, and the partition table's offset (0x8000) may have to move.
- Secure boot v2 belongs with it, with a signing key that has to be kept safe, and losing it ends updates.

## Not yet known

Host only so far (`make test-papermono-storage` in novakind, `tests/papermono_storage_config.py` here): the
configuration, that the images have no burning code, that a partition encrypted with the key hides a token, that the
seeds match ESP-IDF's, and the burn command on a virtual chip. **`nvs_flash_secure_init` and the erase on first start
have never run on hardware,** nor has a session surviving a reboot on encrypted NVS. `build-key` above answers those.
