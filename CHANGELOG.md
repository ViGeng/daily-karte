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

## Compact cards and daily header · 2026-11-09T09:41:53+01:00

The plan was to reduce the space used by activity cards and the daily header so more activities fit on the first screen.

Quick-record cards now place a smaller icon beside the name and duration. Their grid adapts to the available width, and the management cards use the same compact arrangement with less padding. Names can wrap, and buttons retain their minimum 44-pixel touch height.

The daily view keeps its heading available to screen readers while omitting the repeated visible title and instructions. The date controls and header use less space, and the summary displays inline record and estimated-duration totals. A ready account shows its name and a short sync status on one line when space allows. Signed-in users no longer see the sample-day entry unless they are already viewing the sample. Sync warnings and account actions remain available.

All 62 tests, ESLint, JavaScript syntax checks, and the whitespace diff check passed. Browser verification remains incomplete because the browser host was unavailable and native Chrome access was not approved. These local changes have not been deployed.

## Activity heatmap and weekly review · 2026-11-09T09:57:18+01:00

The plan was to add a GitHub-style activity heatmap and a compact weekly overview to the Review tab.

Review now offers Heatmap, Week, and Day modes. The yearly heatmap uses four green intensity levels for daily record counts, includes month labels and a legend, and supports keyboard navigation. It scrolls horizontally on narrow screens. The weekly table shows historical activity names alongside seven Monday-to-Sunday columns, daily counts, and an estimated weekly duration. Both modes open a selected day's totals and editable timeline. Period controls navigate earlier years, weeks, or days and return to the current period. Future dates remain unavailable.

The aggregation includes records without duration, assigns cross-midnight entries to their ending local date, and preserves changed historical card snapshots as separate weekly rows. README documentation now describes these review rules.

All 66 tests, ESLint, JavaScript syntax checks, and the whitespace diff check passed. Additional rendering-function checks covered calendar cells, weekly columns, empty states, unknown durations, escaped activity names, mode selection, and daily timelines. These checks did not use a browser. Visual verification remains incomplete because the browser access host is unavailable. These changes have not been deployed.

## Duration heatmap and calendar week · 2026-11-09T10:19:53+01:00

The plan was to apply the selected review preferences by coloring heatmap squares by estimated daily duration and replacing weekly counts with a calendar positioned by time.

Heatmap levels now represent up to one hour, over one to three hours, over three to six hours, and over six hours of estimated duration. Days containing only records without duration retain an outlined square. The summary and legend describe duration.

The weekly calendar displays seven day columns against a full local 24-hour clock. Overlapping records occupy separate lanes, activities crossing midnight continue in the adjacent column, and records without duration appear as dots. Selecting a block opens its record editor. The compact calendar can expand vertically for more detail. Calendar blocks include portions intersecting the visible week, while totals retain the existing ending-date convention.

All 68 tests, ESLint, JavaScript syntax checks, and the whitespace diff check passed. Rendering-function checks verified duration-based intensity independently of record count, unknown-duration markers, seven calendar columns, time labels, editable blocks, expansion, empty states, and escaped names. Browser visual verification remains incomplete. These changes have not been deployed.

## Guest startup and preview caching · 2026-11-09T10:25:57+01:00

The plan was to investigate an unresponsive guest-entry button in the local preview and prevent stale modules from blocking app startup.

The previous server logs showed new app-script requests without a new model-module request after the review update, consistent with the browser retaining an older module that lacked the new exports. The page assets and model import now use a shared revision parameter to refresh those dependencies. The local preview server sends Cache-Control: no-store, and npm start uses that server. The README documents the updated preview command.

All 69 tests, ESLint, JavaScript syntax checks, and the whitespace diff check passed. The new startup test imports the real app module against a minimal DOM substitute, enters guest mode, opens the heatmap and calendar, and returns to the sign-in screen. The restarted preview returned HTTP 200 responses with no-store headers and served the current script. Browser confirmation of the reported failure remains pending.

## Combined heatmap and weekly blocks · 2026-11-09T10:34:50+01:00

The plan was to keep the weekly overview visible below the heatmap and replace the calendar timeline with compact activity blocks.

Review now always displays the duration heatmap above an activity-by-day grid. Activity rows preserve historical snapshots, and the seven day columns show estimated minutes in colored blocks. A dot marks records without duration. Heatmap years and weeks have separate navigation controls. Selecting a heatmap square or weekly block keeps both overviews visible and opens day details below. The mode selector, calendar timeline, and expansion control have been removed.

Weekly aggregation follows each record's ending local date, including across midnight and daylight-saving changes. The README and automated tests now describe and verify the combined layout. Asset revision parameters were refreshed to prevent a stale module mismatch.

All 69 tests, ESLint, JavaScript syntax checks, and the whitespace diff check passed. The startup and navigation regression test verifies section ordering, all seven weekday columns, persistent overview sections during day inspection, and removal of the timeline layout. Browser visual verification remains pending. These changes have not been deployed.

## Half-hour activity blocks and duration charts · 2026-11-09T10:48:39+01:00

The plan was to position activities in fixed half-hour blocks, assign each block by its greatest recorded overlap, and add duration-distribution charts below the week view.

The weekly grid now displays seven days with 48 clock slots per day. Each block shows the activity with the greatest coverage of that slot. Separate records of the same historical activity combine their coverage, while overlapping portions count only once toward that activity's coverage. Ties prefer the latest-ending record and then its identifier. Cross-midnight records occupy their actual overlapping slots, and unknown durations remain point markers. Skipped clock times are unavailable, and repeated half-hours share one labeled slot. Arrow keys navigate the blocks.

A donut chart shows weekly duration shares, and horizontal bars compare activity durations. These charts use the original estimated durations of records ending in the week, independently of block assignments. Unknown durations remain listed and are excluded from duration shares. The heatmap stays above the week view, and day details remain available below the charts. The README describes these rules, and asset revisions were refreshed.

All 74 tests, ESLint, JavaScript syntax checks, and the whitespace diff check passed. New checks cover dominant overlap, combined and overlapping records, deterministic ties, unknown durations, week boundaries, and skipped or repeated clock times. The app regression test verifies all 336 slots, chart rendering and percentage labels, empty states, and persistent section ordering. Browser visual verification remains incomplete because the browser access host is unavailable. These changes have not been deployed.

## Merged activity blocks and fitted hours · 2026-11-09T10:57:55+01:00

The plan was to display consecutive slots of the same activity as one larger block and automatically fit the week's visible hours to recorded activities.

Consecutive matching activity slots now share one block and one label. Gaps and historical activity changes keep blocks separate. Unknown-duration markers retain their positions inside merged blocks. The default range includes the earliest and latest occupied slots across the week, adds padding, and rounds outward to whole hours. Point events also affect the range. Show full day and Fit activities switch between full and fitted hours, and shorter ranges use taller slots. Empty weeks retain the full day.

These changes affect presentation only. The original records and duration charts remain unchanged. Keyboard navigation now moves between merged blocks and finds overlapping blocks in adjacent days. README documentation and asset revisions were updated.

All 79 tests, ESLint, JavaScript syntax checks, and the whitespace diff check passed. New checks cover merging across records, gaps, historical snapshots, point markers, fitted boundaries, full-day coverage, and preservation of source data. The app regression test verifies a single label per merged block, table coverage, range toggling, chart totals, and keyboard navigation. Browser visual verification remains incomplete because the browser access host is unavailable. These changes have not been deployed.

## Immediate timeline updates during sync · 2026-11-09T14:55:21+01:00

The plan was to keep newly recorded activities visible in Your day without requiring a refresh.

A regression test reproduced a race in which a completed cloud write cleared its pending changes before collection listeners received the updated records. An older snapshot could then remove the newly saved activity from local state. The account store now retains completed changes until snapshots contain their values. Later remote edits take effect after confirmation, and switching accounts clears the retained changes. The app and account-module revision parameters were updated so browsers request the fix.

All 82 tests, ESLint, JavaScript syntax checks, and the whitespace diff check passed. The signed-in app test verifies immediate timeline and summary updates before a cloud write completes, retention through stale snapshots, and immediate undo. Account tests cover both snapshot and write-completion orderings, retained removals, and account isolation. These tests use a DOM substitute and a simulated cloud connection. Live Firebase verification remains pending, and these changes have not been deployed.

## Combined header and visible version · 2026-11-09T14:58:31+01:00

The plan was to combine the highlighted view and account rows and display the app version in small, muted text.

The account strip now sits inside the top header beside the current view and a gray v0.1.0 label. The header shares one border and one row when space allows. Account actions remain available, sync messages can wrap, and narrow screens allow the header contents to wrap. The stylesheet revision was updated so browsers request the new layout, and the README describes the compact header.

All 82 tests, ESLint, JavaScript syntax checks, and the whitespace diff check passed. A structural HTML check confirmed that the account strip appears once inside the header and that the displayed version matches package.json. Browser visual verification remains pending because the local preview server is not running. These changes have not been deployed.

## The app gains PWA support and mobile improvements · 2026-11-12T20:56:57+01:00

The plan was to prioritize phone-based quick recording and installation while preserving the existing interface, recording rules, and local Firebase bindings.

The app now includes an installation manifest, standalone launch settings, and opaque 192-pixel and 512-pixel home-screen icons based on the existing editable artwork. The installation button uses the native browser prompt when available and provides Safari guidance otherwise. A service worker caches an explicit list of public app files for offline startup. Firebase configuration responses, external SDK downloads, authentication requests, and account data bypass that cache. Offline account startup remains limited by the Firebase connection, while an already open account workspace retains its existing local cache and sync queue. Guest records still reset when the session ends or the page reloads.

Downloaded updates now wait for an explicit action. The update controls protect open editors, sign-in flows, guest records, and pending account writes, and they require connectivity before reloading. Connectivity notices explain offline use, and reconnecting retries account synchronization with a handled failure path. Local development registers no worker unless the preview URL includes the pwa query parameter. The README explains how to remove that persistent worker after testing and how to version future cached releases.

The app reuses date and time formatters and preserves unchanged DOM content and heatmap scrolling. Weekly calculations filter to relevant records before sorting and building blocks while preserving cross-week overlap. Offscreen timeline items defer rendering in supporting browsers. Cards provide pressed feedback, mobile edit controls retain 44-pixel touch targets, safe-area padding protects the main content, and editor dialogs scroll independently while locking the background. Reduced-motion preferences remain respected.

A local comparison used 20,000 synthetic records and 30 measured weekly-summary calls after warm-up. Complete outputs matched, and the median calculation time decreased from 5.795 ms to 0.469 ms. These are local computation measurements rather than phone or whole-app loading measurements.

All 96 automated tests passed before the final documentation update. ESLint, JavaScript syntax checks, and whitespace checks also passed. Isolated headless Chrome checks verified touch recording and undo, all three views at 320-, 390-, 768-, and 1280-pixel widths without document overflow, dark appearance, editor background locking, cached offline reload, and recording in a fresh offline guest session. A real worker-upgrade check preserved guest records and an open editor, waited for an explicit safe update, removed only the old app cache, preserved an unrelated cache, and reloaded the updated app offline. No browser JavaScript exceptions occurred during the mobile smoke check.

Real iPhone and Android home-screen installation, live Firebase authentication, database rules, and cross-device synchronization remain unverified. These changes have not been deployed.

The final code passed all 96 tests, ESLint, JavaScript syntax checks, and the whitespace diff check. The generic release snapshot passed its check for all 46 reviewed files without reading or copying the checkout's existing Firebase configuration. An additional 390-by-500-pixel browser check verified that the editor scrolls, its save button remains reachable, and the page background stays locked. An unchanged Review refresh retained both the actual heatmap DOM and its horizontal scroll position.

## Shared npm package preparation · 2026-11-13T23:07:59+01:00

The plan was to pause the Raycast extension and prepare a reusable npm package before adding another client.

The publishable `daily-karte@0.1.0` package now lives in `packages/core`. It owns the shared activity behavior and account synchronization, includes generated TypeScript declarations, and has no runtime dependencies. The browser consumes generated modules from that source, and CI checks their consistency. Browser connection setup remains in thin local adapters. The package retains the existing PolyForm Noncommercial license.

The release gate checks the npm tarball's exact 19-file contents and installs it into an independent temporary consumer. It verifies the JavaScript API and TypeScript declarations and saves the verified artifact under `.artifacts/`. The package README documents the public API, and `docs/npm-release.md` explains publication from Wei's npm account.

All 96 application tests passed. Lint, JavaScript syntax checks, generated-module consistency, standalone installation, and package-consumer checks passed. The development dependency audit reported no vulnerabilities. The public-source release check passed for 64 reviewed files in a temporary snapshot with generic Firebase configuration. The existing local Firebase bindings were preserved. Live Firebase behavior and browser rendering were not reverified in this iteration.

The Raycast scaffold remains incomplete and paused. Its copied activity modules were removed, and its manifest now pins the forthcoming npm release. The package has not been published, and the website has not been deployed.

## Initial npm publication · 2026-11-13T23:25:54+01:00

The plan was to retry publication after Wei enabled npm MFA. The verified daily-karte@0.1.0 tarball was accepted after browser authentication and became publicly available after registry processing.

The public registry version, integrity, and SHA-1 digest matched the verified release artifact. A separate temporary project installed the package from npm, matched its lockfile integrity, and passed an activity API smoke check. The release guide now explains the MFA prerequisite and the processing delay. The README records the completed publication, and the Raycast scaffold remains paused.

The documentation passed the whitespace diff check. No package code changed, and the published tarball was not rebuilt.

## Shared core and platform source boundaries · 2026-11-13T23:33:07+01:00

The plan was to verify the shared dependency and make platform-specific maintenance explicit without changing the published core API.

Browser-owned source files and assets now live in `web`. The Web build generates `dist` from those files and the shared package, and it preserves the existing deployment configuration. A fresh output receives an unconfigured public project binding. The model and sync calculation tests now live beside the core and exercise its built modules directly. The other tests continue to cover browser integration and account boundaries.

The Raycast scaffold now has an independent registry lockfile for daily-karte@0.1.0. A dependency check compares its declared version with the core and checks import boundaries. Generated-file checks cover both Web and core output. The architecture guide documents the owning sources and explains why core changes require a new npm version and a client dependency update.

All 96 tests passed. Lint, syntax checks, generated-file checks, package installation and consumer checks, and the Raycast scaffold's TypeScript check passed. The core tarball and Raycast's locked dependency both matched the published release integrity. A generic source snapshot passed the release check for 95 reviewed files. Existing local Firebase bindings were preserved. The published core code and package metadata were unchanged.

The Raycast commands remain unimplemented, and native behavior and live Firebase synchronization remain unverified. This iteration did not deploy the Web application or publish another npm release.

## npm-backed Web release · 2026-11-13T23:38:17+01:00

The plan was to publish and test the Web application before implementing the Raycast commands. Inspection found that the previous Web build still consumed the repository's compiled core directly, so the release build was changed to consume an actual npm installation.

The Web application now pins daily-karte@0.1.0 in its own package manifest and registry lockfile. The normal build copies that installed package into the static output and records its version and integrity in core-release.json. The separate local build supports unpublished core development and remains the test input. The release check verifies the npm-backed output. CI installs the Web dependency and checks both build paths. The service-worker cache version was advanced for the new deployment.

All 96 tests passed, together with lint, syntax checks, package consumer validation, and npm-backed release checks. The frontend was deployed to the existing dailykarte Firebase Hosting site without changing Firestore rules or data. Eleven deployed files matched the checked build, including package provenance and the service worker.

A fresh headless Chrome profile verified guest recording and undo on the deployed site. The browser checks covered three views at four widths, dark appearance, editor scrolling setup, offline reload, and recording in a fresh offline guest session. No JavaScript exceptions occurred. Mobile day and Review screenshots were inspected. Real-account Google sign-in and cross-device synchronization remain unverified. The Raycast commands remain unimplemented.

## Refactor commit preparation · 2026-11-13

Wei tested the deployed npm-backed Web application and reported no problems. The plan is to commit the shared-core extraction and platform separation before continuing Raycast development. Existing local Firebase project bindings remain outside the commit. The scope of Wei's manual checks was not recorded in detail.

## Raycast native commands · 2026-11-13T23:51:58+01:00

The plan was to implement the Raycast commands after committing the shared npm refactor. Commit 35ab218 records that refactor under Wei Geng's identity and excludes the existing local Firebase bindings.

Record Activity now loads account cards and provides a native form for an ending time, duration, and note. Today lists the current local day's records with details and an estimated duration total. Both commands consume the published shared package for data rules. The Raycast adapter maps Firestore REST documents, validates remote records, and commits merges in transactions. It re-reads on transaction conflicts and preserves activity identifiers across unchanged-form retries after ambiguous commit failures.

Eleven adapter and OAuth lifecycle tests passed. Local ESLint, formatting checks, TypeScript checks, and the distribution build passed. Repository lint and generated-module checks passed. A separate Raycast CI job runs its local checks and tests. The shared package and deployed Web build were not changed by this implementation.

Native interaction checks could not run because computer access to Raycast was not approved. Wei has not yet created the required Google OAuth client, so live sign-in and cross-client synchronization remain unverified. The extension README includes setup and local test instructions. Raycast's additional Store manifest validation rejects the existing noncommercial license declaration because its schema requires MIT. The existing license was retained, and Store validation remains a separate failing check. This iteration did not submit the extension to the Store or commit the extension implementation.

## Raycast manual test handoff · 2026-11-13T23:53:39+01:00

The plan was to start the development server for Wei to test the native commands. Eleven adapter tests, local lint, and TypeScript checks passed. The development server compiled both commands and reached its ready state. The README now links directly to Google Cloud OAuth client settings and explains their relationship to Firebase Authentication. Native interaction and live sign-in results remain pending manual testing.

## Separate extension licensing · 2026-11-13T23:55:59+01:00

Wei authorized MIT for the Raycast platform code while retaining the existing shared npm core license. The extension license file, manifest, and root lockfile metadata now declare MIT. Its third-party notices preserve the core copyright notice and a copy of its PolyForm Noncommercial license. Repository documentation now explains these separate scopes.

The core license bytes and its dependency lock entry were verified unchanged, including the published version and integrity. Local lint, TypeScript checks, all 11 adapter tests, and the full Raycast manifest and Store lint passed. The previous license declaration error is resolved. This change did not republish the core or submit the extension to the Store.

## Google-only Raycast onboarding · 2026-11-14T00:08:15+01:00

The plan was to remove user-facing Firebase project and Google OAuth client fields and make sign-in use the official service. Wei supplied the public iOS OAuth client ID after creating it in the existing Google Cloud project.

The extension now supplies both public application identifiers from its own service configuration. Its manifest declares no required user preferences, and the connection error view no longer directs users to edit development IDs. The onboarding test exercises Google authorization using that application configuration. Maintainer setup instructions moved to DEVELOPMENT.md, while the extension README describes the user sign-in flow. The release checker explicitly permits the official extension's public service identifiers without changing its secret checks.

All 12 adapter and onboarding tests, local lint, and TypeScript checks passed. Real Google consent, native interaction, and cross-client synchronization remain pending manual testing. The shared npm core and its PolyForm license were unchanged, and the Raycast platform code retains MIT.

The final onboarding implementation also passed the full Raycast manifest and Store lint and the distribution build. The generic source snapshot passed its release check for 109 reviewed files.

## Firebase user save compatibility · 2026-11-14T00:15:06+01:00

Wei reached the native recording form but received PERMISSION_DENIED when saving. The extension used the REST beginTransaction endpoint to create a read-write transaction. Firestore documentation states that third-party authenticated requests cannot create those transactions. The earlier transport substitutes accepted that unsupported flow and missed the restriction.

The save adapter now reads records normally and commits each merge atomically. Creates require an unused ID, and deletes require the exact updateTime read from each merged record. Known version conflicts cause a fresh query before retrying. Ambiguous failures still preserve the form's activity ID for a manual retry. The database rules were not modified or redeployed, and the shared npm package was unchanged.

All 17 adapter and onboarding tests passed, including the Firebase user endpoint restriction, version checks, concurrent edits, racing creates, bounded retries, and ambiguous commit failures. Local lint and TypeScript checks passed. The actual save still requires a native user retry after rebuilding the development extension.

The final save fix also passed full Raycast manifest and Store lint and the distribution build. Repository lint and generated-module checks passed, and the Firestore rules and shared core had no changes.

## Raycast card management and daily statistics · 2026-11-14T00:28:34+01:00

Wei confirmed that native recording works after the Firebase save fix. The plan was to replace the plain lists with split list and detail views, add creation and editing for activity cards, add editing for saved records, and show useful daily statistics.

Record Activity now shows card details and provides native forms for names, icons, colors, and default durations. Today includes an overview, per-activity totals, and a timeline with an editor for ending times, durations, and notes. Its overview reports record count, total estimated duration, activity count, average timed duration, and records without a duration. Card updates preserve historical record snapshots. Record edits retain their identity and creation time, refresh the timeline after saving, and apply the shared merge rules on the target date.

Editors load the current document version and require it when saving. A stale editor refuses to overwrite a change from another client. Conditional neighbor deletions retain their existing conflict protection. The new presentation helpers use the published core's daily summary rather than introducing another aggregation model.

All 30 Raycast tests passed, including card saves, stale editors, cross-date record moves, neighbor conflicts, retry confirmation, input validation, and daily statistics. TypeScript, local lint, full Raycast Store lint, and the distribution build passed. Repository lint, generated-module checks, and dependency boundary checks passed. The core, Web sources, Firestore rules, and published npm package were unchanged. Native acceptance tests for the new interface and editing flows remain pending Wei's manual test.

## Raycast Today view selector · 2026-11-14T00:41:00+01:00

Wei requested the native dropdown pattern shown in his screenshots. The plan was to organize Today into selectable views at the right of its search bar.

Today now opens in Overview and provides a native dropdown for Overview, By Activity, and Timeline. Only the selected view appears, while its details and actions remain available. Switching views clears the previous search. Both commands explicitly enable native filtering with their controlled search text, correcting the search behavior found during the documentation check.

All 30 existing tests, TypeScript checks, and local lint passed. The dropdown's native appearance and interactions still require Wei's manual test.

Full Raycast Store lint and the distribution build also passed. The development server was restarted for manual testing.

## Remembered Raycast views and weekly calendar · 2026-11-14

Wei requested that Today remove Overview, default to Timeline, restore the last selected view after reopening, and provide more information through a weekly calendar. The plan was to use native dropdown persistence and reuse the published core's weekly statistics and block layout.

Today now defaults to Timeline and uses Raycast's stored dropdown selection for subsequent launches. Its available views are Timeline, By Activity, and Weekly Calendar. Daily record counts and estimated duration remain in the list headings. The calendar shows Monday through Sunday with colored half-hour blocks, untimed markers, overlap markers, and a highlighted day. Users can navigate earlier weeks, expand the calendar, and open a day's editable records. The shared record item component keeps timeline details and edit actions consistent across both lists.

Weekly queries include a 24-hour lookahead after the boundary so that the shared layout can display records crossing into the week from Sunday. The shared package still owns aggregation, date boundaries, overlap handling, and block layout. Calendar images are generated in memory, while Raycast persists only the view selection.

All 35 Raycast tests passed, including weekly query boundaries, cross-week records, daylight-saving behavior, SVG escaping, and calendar markers. TypeScript, local lint, full Raycast Store lint, and the distribution build passed. Repository lint, generated-module checks, and dependency boundaries passed. Light and dark calendar examples were rendered with sample data in an isolated headless browser and visually inspected. Native dropdown restoration and calendar display remain pending Wei's manual test.

## Standalone current-week calendar · 2026-11-14T00:54:54+01:00

Wei requested a separate weekly command because the calendar no longer belongs under Today. His screenshot showed the split preview clipping the image above the metadata. The plan was to display only the current week across the full content area and remove the surrounding explanations.

This Week now has its own command and renders one calendar image in a native Detail view. It has no left list, metadata panel, large heading, explanatory paragraphs, earlier-week navigation, or day drilldown. The image includes dates in its column headers and fits within 336 pixels of intrinsic height even when activities span all 24 hours. Today retains only Timeline and By Activity, with its existing native selection persistence. Its data loader once again queries only today's records.

All 36 Raycast tests passed, including a new full-week image-fit check. TypeScript, local lint, full Raycast Store lint, and the three-command distribution build passed. Repository lint, generated checks, and dependency boundaries passed. A compact light and dark preview with midnight and late-evening sample records was rendered and visually inspected. The actual standalone layout remains pending Wei's native test after restarting development mode.

## Raycast activity gallery · 2026-11-14T00:58:00+01:00

Wei confirmed that the current interface works well and requested a gallery instead of a list for Record Activity. The plan was to replace its split List with Raycast's native Grid while retaining the existing account and form flows.

Record Activity now displays four columns of activity tiles with colored icons or custom emoji, names, and default durations. Native search filtering, recording, card creation, card editing, refresh, and browser actions remain available. The card gallery uses the existing icon mapping and shared package without introducing generated tile assets or another data model.

All 36 existing tests, TypeScript checks, local lint, full Raycast Store lint, and the three-command distribution build passed. The gallery's native appearance remains pending Wei's manual test.

## Compact gallery and native emoji content · 2026-11-14T01:03:09+01:00

Wei's screenshot showed that the four-column gallery was too large and its images were blank. The previous compiler and transport checks had not established native image rendering. The plan was to reduce tile size and use explicit Grid content values with native emoji rendering.

Record Activity now uses six columns with a 16:9 aspect ratio and medium insets. The section explicitly carries the same layout settings. Each tile supplies a content value and full-name tooltip. Custom emoji pass directly to Raycast as emoji strings instead of theme-specific SVG sources, while built-in icons retain their native source and color. Record, create, and edit actions remain available.

All 36 existing tests, TypeScript checks, local lint, full Raycast Store lint, and the distribution build passed. The actual native icon and emoji display still requires Wei's manual check after restarting development mode.

## Balanced activity tile proportions · 2026-11-14T01:04:48+01:00

Wei's latest screenshot confirms that native emoji and built-in icons now display. He requested more natural gallery proportions because the wide tiles left too much space around the small images. The plan was to use square icon tiles with less internal padding.

The gallery retains six columns and now uses a square aspect ratio with small image insets. Native labels, default durations, full-name tooltips, and form actions remain available. The README describes the current square layout.

All 36 existing tests, TypeScript checks, local lint, full Raycast Store lint, and the distribution build passed. The new tile proportions still require Wei's native visual check.

## Raycast Store submission · 2026-11-14T01:25:20+01:00

Wei tested the native extension, reported that it works well, and requested a new-extension PR following Raycast's submission guidelines. He confirmed that the Google OAuth application is in production. The plan was to export an independent extension from the current official main branch, prepare Store documentation and native captures, validate the distribution, and submit it for review.

PR https://github.com/raycast/extensions/pull/33505 now submits the extension from codex/daily-karte and is ready for review. Its changes are limited to extensions/daily-karte. Commits 458c025df2 and 6bac327b35 use Wei Geng's identity and email. The source repository now provides an explicit exporter, a user-facing Store README, standard 120-column formatting, official data-loading and failure-toast utilities, and a single initial Store changelog entry. Internal development history remains in this repository.

The final export contains three unmodified 2000-by-1250 native Capture Window images with matching backgrounds. A screenshot containing the account email was excluded and retained only in ignored local artifacts. The gallery no longer displays that email. The author supplied fresh captures of all three commands after the independent distribution build, and they were inspected. The image bytes were preserved when the approved captures were renamed.

An independent npm installation passed all 36 tests, TypeScript checks, official Raycast lint, and the distribution build. npm reported zero known vulnerabilities after a patched minimatch override was added to the development dependency tree. The official metadata validator passed all three final captures. Repository lint, generated-file and dependency-boundary checks, source export comparison, and the generic 124-file release snapshot passed. The core license hash remained unchanged, and the extension preserves its MIT platform license alongside the dependency's PolyForm Noncommercial notice and license text.

The latest PR commit passed GitHub's build, npm, changelog, duplicate-extension, maintainer-edit, and metadata checks. Automated code review and Socket pull-request alerts were still running at this checkpoint. Raycast human review and Store publication remain outstanding. The Web sources, deployed application, shared npm package, and Firestore rules were not changed by the submission.

## Raycast reviewer bot fixes · 2026-11-14T01:53:49+01:00

Wei requested fixes for the reviewer bot's comments on PR 33505. The plan was to inspect all seven findings, reproduce the merge retry defect, update the owning source, export the changes, and push them to the existing submission branch.

Commit 1fec030364 addresses all seven findings and uses Wei Geng's identity. Recording forms now retain the exact attempted merge result across new Firestore client instances. An unchanged retry can confirm an already-saved merged edit without rebuilding it from neighbors deleted by the successful first commit. A later edit from another client still produces a conflict. Three regression cases cover these outcomes, and the successful-merge case reproduces the original false-conflict error on the prior code.

Google OAuth now uses OAuthService.google, withAccessToken, and getAccessToken from the official Raycast utilities. The authorization namespace, client ID, and scopes remain consistent with the existing configuration. The custom Google authorization and refresh implementation was removed, while the validated Firebase exchange remains in the platform adapter. Wei reopened a command after the migration and confirmed that existing account data loads normally.

The manifest now states that a Google account is required. Gallery actions reserve the first two automatic shortcut slots, and the shortcut table reflects primary timeline editing and calendar refresh through Return. All refresh and retry actions have consistent icons. Split lists use subtitles and detail metadata instead of accessories. The error view has a search placeholder. The Store changelog retains one initial release entry, and all fixes were applied to the source before export.

All 39 tests, TypeScript checks, local lint, full Raycast Store lint, and the distribution build passed in the exported PR directory. Repository lint, generated checks, dependency boundaries, source export comparison, and whitespace checks passed. All seven bot threads received specific replies and were marked resolved. GitHub checks were rerunning after the push, and renewed automated review and Raycast human review remained outstanding at this checkpoint.

## Commit the completed extension to the source repository · 2026-11-14T02:01:15+01:00

Wei requested that all necessary work be committed and pushed to the Daily Karte repository. The plan was to include the completed Raycast implementation, account integration, tests, native Store screenshots, license notices, CI job, export tooling, and current documentation. The earlier shared-core refactor is already committed locally and is also ahead of the remote main branch.

All 96 Web and core tests and all 39 Raycast tests passed in this session. Repository lint, JavaScript syntax checks, generated-file and dependency-boundary checks, Raycast type checks, and Raycast lint passed. The architecture introduction now reflects the completed native implementation and Wei's successful account-loading check. Existing machine-specific changes in .firebaserc.example and dist/site-config.js remain outside the commit. The staged source tree will be checked against the public-release allowlist before the normal main-branch push.

The actual staged source snapshot passed the release check for 124 reviewed files, and the Web release output matched its pinned npm dependency. The commit includes 41 reviewed source files and excludes both local Firebase binding files.
