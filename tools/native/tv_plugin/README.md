# TV output plugin (Play on TV)

A GDExtension for the iPhone app that gives the game a true second screen on a TV
(AirPlay screen mirroring to an Apple TV or AirPlay TV, or a USB-C / HDMI adapter).

How it fits together:

- `native/screens.gd` (the main scene) renders the game, world and HUD, into one
  SubViewport. On the phone alone it is the phone's size and fills the phone. With a
  TV it takes the TV's pixel size (capped at 1080 lines) and a 16:9 canvas, the HUD
  keeps to the TV's safe margin (`UITheme.safe_rect` reads the viewport's `tv_safe`
  meta), and the phone shows `native/tv/companion.gd` (the start menu, a live
  preview, Pause). Nothing in the game is moved or rebuilt, so the TV can come and
  go mid-game.
- `native/tv/tv_link.gd` talks to the engine singleton `PalletTV` from this plugin,
  or to a desktop stand-in (`-- --fake-tv=1920x1080` opens a second window as the
  TV; `res://dev/tv_test.tscn` checks the whole path).
- `src/tv_ios.m`: the external display's scene (role
  `UIWindowSceneSessionRoleExternalDisplayNonInteractive`) is given to its own scene
  delegate (the engine's delegate would treat a TV unplugged as the game losing
  focus), one window with a `CAMetalLayer`, and a display link on the TV's screen.
  At each TV refresh with a new frame, the game's colour texture (an `MTLTexture`
  from `RenderingServer.texture_get_native_handle`) is drawn into the layer with one
  full-screen triangle on the engine's own `MTLCommandQueue`, after the engine's
  frame. No CPU readback. Also the system AirPlay picker (`AVRoutePickerView`) and
  the TV's name, mode and refresh.
- `src/pallet_tv.cpp`: the godot-cpp binding (`get_status`, `set_source`,
  `frame_drawn`, `set_active`, `show_route_picker`).

Build (ios.yml does it before the export; the result goes to `native/tv/ios/`,
which is git-ignored, so the app's patch ids are unaffected):

    tools/native/tv_plugin/build_ios.sh native/tv/ios      # macOS + Xcode, scons

A desktop build on a stub (to test the bindings only):

    GODOT_CPP=<godot-cpp checkout> scons platform=linux target=template_debug build_profile=$PWD/build_profile.json

The plugin is native code: changing it needs a new .ipa (an over-the-air patch
cannot change it). The GDScript side can be patched as usual.
