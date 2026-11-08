# Changelog

## 0.1.0 · 2026-11-06

This initial source release provides a static activity-card journal with a Google sign-in entry and an isolated guest experience.

The release includes editable activity presets, approximate time records, a daily timeline, and activity summaries. Its optional Firebase connector uses a deployer's own project and has cloud connectivity disabled by default.

The pre-release review added strict cached-data validation and escaped dynamic color attributes. It also pinned a patched development dependency after an npm advisory check. The public snapshot excludes earlier internal hosting metadata and local deployment configuration.

Google sign-in, live Firestore rules, and real cross-device synchronization still need deployment verification. The current user interface uses Simplified Chinese. JSON backup import and media attachments are not implemented.

## Roadmap completion · 2026-11-07T17:37:45+01:00

The plan was to complete the five README roadmap items while preserving existing account isolation, historical activity snapshots, and local deployment configuration.

The app now merges neighboring records from the same card when they overlap or have a gap of up to five minutes. Merging retains notes, avoids double-counting overlaps, and supports undo across local state and queued cloud writes. Records without duration and records with different snapshot details remain separate.

The duration picker now offers 90- and 120-minute presets alongside the existing options. Cards accept custom emoji or symbols, and both cached-data validation and Firestore rules accept the new icon format. The interface uses English and a simpler layout with system light and dark appearance.

All 62 tests passed. ESLint, JavaScript syntax checks, static element-reference checks, and the whitespace diff check also passed. The release check passed for all 34 reviewed files in a temporary snapshot with generic Firebase configuration. The working checkout's release check still rejects its existing local Firebase bindings, which were preserved.

Rendered browser verification remains incomplete because browser access was unavailable and the native Safari automation timed out. Live authentication, Firestore rule execution, and cross-device synchronization remain unverified. Existing deployments must deploy the updated rules together with the app to accept custom icons.

## Website icon · 2026-11-07T17:47:23+01:00

The plan was to use the existing four-card brand mark for dedicated browser and mobile home-screen icons.

The website now links an editable SVG favicon, an ICO fallback containing 16-, 32-, and 48-pixel images, and a 180-pixel Apple touch icon. The README describes the source artwork, and the release checker includes the new assets while skipping binary image content.

The generated artwork was visually inspected. Icon links, image dimensions, and PNG checksums passed validation. All 62 tests, ESLint, JavaScript syntax checks, and the whitespace diff check passed. The release check passed for 37 reviewed files in a temporary copy with generic Firebase configuration. These local changes have not been deployed.
