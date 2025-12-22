# Meeting Detail Page Redesign - Testing Checklist

## Overview
This document outlines the testing procedures for the redesigned meeting detail page with FAB, bottom sheets, and unified action items.

## Prerequisites
- Dev server running (`npm start` or `bun start`)
- At least one meeting with:
  - AI-generated summary
  - Transcript segments
  - Audio recording
  - AI-generated follow-up actions or manual tasks

## Test Flows

### 1. FAB (Floating Action Button) Tests

#### 1.1 FAB Visibility
- [ ] FAB appears in bottom-right corner above audio player
- [ ] FAB maintains position when scrolling content
- [ ] FAB is positioned 16px from right edge
- [ ] FAB is positioned 16px above audio player bar

#### 1.2 FAB Expansion (Speed Dial)
- [ ] Tap FAB → Expands with smooth spring animation
- [ ] Shows 3 action buttons sliding up:
  - Add Task (bottom/closest)
  - Edit (middle)
  - Share (top/furthest)
- [ ] Each button shows label on the left
- [ ] Background dims with semi-transparent overlay
- [ ] Haptic feedback on tap (mobile only)
- [ ] Main button rotates 45° (+ becomes ×)

#### 1.3 FAB Collapse
- [ ] Tap FAB again → Collapses with reverse animation
- [ ] Tap backdrop → Collapses FAB
- [ ] Select any action → Auto-collapses after selection
- [ ] Haptic feedback on collapse (mobile only)

#### 1.4 FAB Actions

**Add Task:**
- [ ] Tap "Add Task" → Quick Add Modal opens
- [ ] FAB collapses smoothly before modal appears
- [ ] Modal is centered on screen
- [ ] Input field is auto-focused

**Edit Meeting:**
- [ ] Tap "Edit" → Navigates to edit-meeting screen
- [ ] FAB collapses before navigation
- [ ] Returns to meeting detail after editing

**Share:**
- [ ] Tap "Share" → Native share sheet opens (mobile)
- [ ] On web: Copies to clipboard and shows alert
- [ ] Share text includes:
  - Meeting title
  - Date & duration
  - Summary (one-sentence)
  - All action items
- [ ] FAB collapses after sharing

### 2. Quick Add Task Modal Tests

#### 2.1 Modal Display
- [ ] Modal appears centered with fade animation
- [ ] Semi-transparent backdrop behind modal
- [ ] "Add Task" title visible
- [ ] Close (X) button in top-right
- [ ] Input field is auto-focused
- [ ] Helper text: "AI will suggest owner and due date based on meeting context"
- [ ] Cancel button (left)
- [ ] Add Task button (right, blue accent color)

#### 2.2 Input Behavior
- [ ] Can type task description
- [ ] Multiline input (up to 2 lines visible)
- [ ] Add Task button disabled when empty
- [ ] Add Task button enabled when text entered
- [ ] Submit on Enter key (mobile keyboard)

#### 2.3 Task Creation
- [ ] Tap "Add Task" → Loading indicator appears
- [ ] Task created in database
- [ ] AI enhancement edge function called
- [ ] Task appears in Action Items list
- [ ] Modal closes automatically
- [ ] Success haptic feedback (mobile only)

#### 2.4 AI Enhancement
- [ ] Edge function receives meeting_id and task_title
- [ ] Returns owner suggestion (if applicable)
- [ ] Returns deadline suggestion (if applicable)
- [ ] Task saved with AI-suggested metadata
- [ ] Falls back gracefully if AI fails

#### 2.5 Modal Dismissal
- [ ] Tap Cancel → Modal closes
- [ ] Tap backdrop → Modal closes
- [ ] Back button (Android) → Modal closes
- [ ] Task input cleared after dismissal

### 3. Insights Bottom Sheet Tests

#### 3.1 Opening
- [ ] Tap "View Details" link on Summary Card → Sheet slides up
- [ ] Smooth slide animation from bottom
- [ ] Handle bar visible at top
- [ ] "Meeting Insights" title in header
- [ ] Close (X) button in header

#### 3.2 Content Display
- [ ] All sections with data are visible:
  - Key Facts
  - Legal Issues
  - Decisions Made
  - Risks & Concerns
  - Open Questions
- [ ] Sections with no data are hidden
- [ ] Each item shows bullet point
- [ ] Text is readable and properly formatted
- [ ] Content is scrollable if long

#### 3.3 Dismissal
- [ ] Tap X button → Sheet slides down
- [ ] Tap backdrop → Sheet slides down
- [ ] Swipe down on handle → Sheet slides down
- [ ] Back button (Android) → Sheet slides down

### 4. Transcript Bottom Sheet Tests

#### 4.1 Opening
- [ ] Tap "Transcript" button on audio bar → Sheet slides up
- [ ] Smooth slide animation from bottom
- [ ] Handle bar visible at top
- [ ] "Transcript" title in header
- [ ] Close (X) button in header
- [ ] Search bar visible below header

#### 4.2 Search Functionality
- [ ] Can type in search input
- [ ] Search icon on left
- [ ] Clear (X) button appears when typing
- [ ] Transcript filters as you type
- [ ] Matching text is highlighted in yellow
- [ ] Shows "No matches found" when no results

#### 4.3 Transcript Display
- [ ] Segments show speaker name (or label)
- [ ] Timestamp visible for each segment (MM:SS format)
- [ ] Text is readable and properly formatted
- [ ] Segments are scrollable

#### 4.4 Audio Seek
- [ ] Tap any transcript segment → Audio seeks to that timestamp
- [ ] Haptic feedback on tap (mobile only)
- [ ] Playback starts at correct position
- [ ] Sheet remains open during playback

#### 4.5 Dismissal
- [ ] Tap X button → Sheet slides down
- [ ] Tap backdrop → Sheet slides down
- [ ] Swipe down on handle → Sheet slides down
- [ ] Back button (Android) → Sheet slides down
- [ ] Search query clears on close

### 5. Unified Action Items Tests

#### 5.1 List Display
- [ ] Action Items card shows count: "Action Items (N)"
- [ ] Manual tasks and AI-generated actions merged in one list
- [ ] Each item shows:
  - Checkbox (left)
  - Title
  - Sparkle icon (for AI-generated items only)
  - Owner and/or due date (if available)
  - Delete button (for manual tasks only)

#### 5.2 Task Completion
- [ ] Tap checkbox → Toggles completed state
- [ ] Checkmark appears with green fill
- [ ] Title gets strikethrough when completed
- [ ] Text becomes muted color
- [ ] Haptic feedback on toggle (mobile only)
- [ ] State persists in database

#### 5.3 AI vs Manual Indicators
- [ ] AI-generated actions show sparkle icon ✨
- [ ] Manual tasks do NOT show sparkle icon
- [ ] Only manual tasks show delete button
- [ ] AI actions cannot be deleted (visual only)

#### 5.4 Task Deletion
- [ ] Tap trash icon on manual task → Confirmation alert
- [ ] Confirm deletion → Task removed from list
- [ ] Cancellation → Task remains in list
- [ ] Deletion persists in database

#### 5.5 Empty State
- [ ] Shows "No action items yet. Tap + to add one." when empty
- [ ] Shows "Tasks are being generated..." during processing

### 6. Page Layout Tests

#### 6.1 Header
- [ ] Back button (left) → Returns to home
- [ ] Meeting title (center, truncated if long)
- [ ] Date + duration below title
- [ ] Edit button (right) → Opens edit menu dropdown

#### 6.2 Edit Menu Dropdown
- [ ] Tap edit button → Dropdown appears
- [ ] "Edit Meeting" option
- [ ] "Delete" option (red text)
- [ ] Tap "Edit Meeting" → Navigates to edit screen
- [ ] Tap "Delete" → Confirmation alert → Deletes meeting
- [ ] Tap outside → Closes menu

#### 6.3 Summary Card
- [ ] Card appears first (top of content)
- [ ] "Summary" title visible
- [ ] Topics shown as colored chips (if available)
- [ ] One-sentence summary text (readable font size)
- [ ] "View Details" link with arrow icon
- [ ] No collapsible behavior (always expanded)
- [ ] No AI disclaimer banner

#### 6.4 Action Items Card
- [ ] Card appears second
- [ ] "Action Items (N)" title with count
- [ ] Action items list (see section 5)
- [ ] No inline "Quick add" input (removed)
- [ ] No priority badges (removed per user request)

#### 6.5 Billing Card
- [ ] Only shows if meeting.billable is true
- [ ] Dollar sign icon in green circle
- [ ] "Billable Amount" label
- [ ] Amount in green: "$XX.XX"
- [ ] Detail: "Xh Ym @ $XXX/hr"
- [ ] Card not present if meeting not billable

#### 6.6 Audio Player Bar
- [ ] Fixed to bottom of screen
- [ ] Play/pause button (left, circular, accent color)
- [ ] Progress bar (center, tappable)
- [ ] Time display (MM:SS / MM:SS)
- [ ] "Transcript" button (right)
- [ ] Tap progress bar → Seeks audio
- [ ] Tap play/pause → Toggles playback
- [ ] Shows loading state during audio load
- [ ] Shows error state if audio fails
- [ ] Shows transcoding state if converting

### 7. Mobile-Native Behaviors

#### 7.1 Animations
- [ ] FAB expansion: Smooth spring animation
- [ ] Bottom sheets: Slide up/down animation
- [ ] Modal: Fade in/out animation
- [ ] All animations feel natural and responsive

#### 7.2 Haptic Feedback
- [ ] FAB tap: Medium impact
- [ ] Checkbox toggle: Light impact
- [ ] Audio seek: Light impact
- [ ] Task creation: Success notification
- [ ] (All haptics mobile-only, no errors on web)

#### 7.3 Gestures
- [ ] Swipe down on bottom sheet handle → Dismisses
- [ ] Tap backdrop → Dismisses modals/sheets
- [ ] Long press (future: Quick actions on tasks)

#### 7.4 Touch Targets
- [ ] All buttons min 44x44 pts
- [ ] FAB is 60x60 pts (main button)
- [ ] Secondary FAB buttons are 48x48 pts
- [ ] Checkboxes are large enough to tap easily

### 8. Edge Cases

#### 8.1 No Audio
- [ ] Audio bar hidden if no audio_path
- [ ] FAB positioned at bottom (no audio bar)
- [ ] Page still functional without audio

#### 8.2 Processing State
- [ ] Shows "Summary is being generated..." if processing
- [ ] Shows "Tasks are being generated..." if processing
- [ ] Shows "Transcript is being generated..." if processing
- [ ] Loading indicators where appropriate

#### 8.3 Empty Data
- [ ] No summary → Shows message
- [ ] No tasks → Shows "No action items yet"
- [ ] No transcript → Shows message in bottom sheet
- [ ] No billing → Card not displayed

#### 8.4 Audio Errors
- [ ] WebM on iOS → Shows error message
- [ ] Failed transcode → Shows retry button
- [ ] Transcoding → Shows loading with spinner
- [ ] Download error → Shows error message

#### 8.5 Network Issues
- [ ] AI enhancement fails → Task still created with defaults
- [ ] Task creation fails → Shows error to user
- [ ] Audio download fails → Shows error message

### 9. Cross-Platform Tests

#### 9.1 iOS
- [ ] All features work as expected
- [ ] Haptic feedback works
- [ ] Native share sheet works
- [ ] Audio playback works (M4A only)
- [ ] Gestures feel natural

#### 9.2 Android
- [ ] All features work as expected
- [ ] Haptic feedback works
- [ ] Native share sheet works
- [ ] Audio playback works (M4A/WebM)
- [ ] Back button behavior correct

#### 9.3 Web
- [ ] All features work as expected
- [ ] No haptic feedback (no errors)
- [ ] Share copies to clipboard
- [ ] Audio playback works (all formats)
- [ ] Click interactions work

### 10. Performance Tests

#### 10.1 Rendering
- [ ] Page loads quickly
- [ ] No lag when opening modals
- [ ] FAB animations smooth (60fps)
- [ ] Bottom sheets slide smoothly
- [ ] Scrolling is performant

#### 10.2 Audio
- [ ] Audio loads without blocking UI
- [ ] Playback is smooth
- [ ] Seeking is responsive
- [ ] No memory leaks on unmount

#### 10.3 Lists
- [ ] Action items render quickly
- [ ] Transcript segments render quickly
- [ ] Scrolling long lists is smooth

## Success Criteria

All tests passing means:
✅ FAB works perfectly with speed dial pattern
✅ All 3 FAB actions (Add Task, Edit, Share) functional
✅ Quick Add modal works with AI enhancement
✅ Insights bottom sheet displays all data
✅ Transcript bottom sheet with search and seek
✅ Unified action items (AI + manual) displayed correctly
✅ No priority badges (simplified as requested)
✅ No AI disclaimer banner
✅ Card-based layout is clean and glanceable
✅ Audio playback works across platforms
✅ Mobile-native feel (animations, haptics, gestures)
✅ FAB positioned correctly above audio bar
✅ All actions accessible within 1-2 taps
✅ Zero linter errors

## Notes for User

To test this implementation:

1. **Start the dev server**: `npm start` or `bun start`
2. **Navigate to a meeting**: Open any existing meeting
3. **Test FAB**: Tap the + button in bottom-right
4. **Test Add Task**: Use FAB → Add Task → Type and submit
5. **Test Share**: Use FAB → Share → Check output
6. **Test Insights**: Tap "View Details" on summary
7. **Test Transcript**: Tap "Transcript" button on audio bar
8. **Test Actions**: Toggle checkboxes, delete tasks
9. **Test Audio**: Play/pause, seek, listen

Expected result: Fast, intuitive, mobile-first experience with minimal taps to accomplish any action.

