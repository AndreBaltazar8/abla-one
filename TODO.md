# TODO

## Rules

- All open work on Abla One is tracked here. Add new tasks as they come up.
- Each big item gets at least one commit of its own, and can take several.
- This file can be committed at any time, along with the work or on its own.
- As soon as a task is completed, take it off this file, in the commit that
  finishes it. Git history is the record of what got done.
- Only list what is really open. A task is done when it is verified where it
  runs (on the device for device work), not just when it compiles.

## PaperMono (on the device)

- [ ] A collection during a tap still costs about 200 ms (2 of 12 screen-changing
      injected taps took 216 and 260 ms; the others 62-89 ms, against 111-133 ms with
      arrays). The idle collection in `onePaperMonoLoop` does not always run first.

## Toolchain

- [ ] `tools/check-native-buffer-host` in abla-embedded runs all its fixtures and reports
      failures: 1177 of 1207 pass, 30 fail for reasons outside the tool.
      - 22 do not compile: `method.argument:M5BoardId.imuAxisOrder` in
        `src/m5stack/imu_orientation.ab`: bmi270-frame, corematrix-imu-wire, imu-board-orientation,
        imu-control, imu-measurement, imu-owner, imu-owner-clock, imu-owner-clock-wire,
        imu-owner-control-wire, imu-owner-temperature, imu-owner-update, imu-prepared, imu-probe,
        imu-temperature, nesso-devices-wire, nesso-imu-wire, p4-hardware-imu-owner,
        pm1-board-imu, pm1-imu-owner, pm1-imu-owner-wire, sensors-begin, sensors-update
        (each `-native`).
      - 8 build and return a failure (exit code): pm1-wake-pins-s3 (2), rtc-input-s3 (2),
        pm1-digital-s3 (2), s3-psram-cold (1), pm1-external-read (1), sdmmc-pin-snapshot (7),
        battery-current-driver (1), spi-s3-exchange (1) (each `-native`).
