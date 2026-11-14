# Changelog

## Initial version · 2026-11-13

The extension provides Record Activity and Today commands backed by the shared daily-karte npm package. Google OAuth connects the existing Firebase account. Live sign-in and native interactions still require user testing.

The initial save adapter was corrected to use version-conditioned atomic commits supported by Firebase user authentication. The regression suite rejects REST read-write transaction endpoints and covers concurrent edits and idempotent retries.

The commands now use split list and detail views. Activity cards can be created and edited, and today's saved records have an editor for their ending time, duration, and note. Today also shows daily statistics and per-activity totals. Version conditions protect existing records from stale editors. Wei confirmed that recording works before these interface changes, while the new flows still require manual testing.

Today now uses a native search-bar dropdown to switch between Overview, By Activity, and Timeline. Only the selected view appears, and switching views clears the previous search. Both commands retain native search filtering when their search text is controlled.

Today now removes Overview, defaults to Timeline, and restores the last selected view. Weekly Calendar adds colored half-hour blocks, day and week totals, week navigation, a larger calendar view, and access to each day's editable records. The calendar uses the shared package's weekly summary and layout functions.

The calendar now has its own This Week command, which displays only the current week in a full-width Detail view. Its compact image replaces the split layout and removes the day list, metadata panel, explanatory text, and earlier-week navigation. Today retains Timeline and By Activity with native view persistence.

Record Activity now presents activity cards in a native four-column grid. Each tile displays its icon, name, and default duration. Search, recording, card creation, and card editing remain available through the same actions and shortcuts.

The gallery now uses six columns of shorter tiles with full-name tooltips. Grid content explicitly supplies its value and tooltip, and custom emoji use Raycast's native emoji rendering instead of an SVG image source. This adjustment follows a user screenshot showing oversized, blank tiles in the first gallery implementation.

The gallery now uses square tiles with smaller image insets to give the icons and emoji a more balanced proportion. Wei's latest screenshot confirms that both image types display with the explicit Grid content values.

Store preparation now uses Raycast's standard formatter, official loading and failure-toast utilities, a user-facing README, and a reproducible standalone export. The gallery no longer displays the account email. The exported extension includes native Store captures and one initial release changelog entry, while the source repository retains this development history.

Reviewer fixes now use the official Google OAuth service and authenticated command wrapper while retaining the existing authorization namespace. Recording forms remember the exact attempted merge so a lost response can be confirmed without rebuilding it from deleted neighbors. The Store description states the Google account requirement. Action order, shortcuts, refresh icons, split-list subtitles, and the error search placeholder follow the current Store rules.
