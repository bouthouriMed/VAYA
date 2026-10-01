import { StyleSheet } from 'react-native';
import { spacing, radii, typography } from '@vaya/design-system';

/** Styles for the ride-publishing wizard ((tabs)/publish.tsx and its step components). */
export const publishStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Mirrors (tabs)/explore.tsx's mapSection/card/handle styles exactly —
  // same structural pattern, not a second visual language for Publish.
  mapSection: {
    position: 'relative',
    overflow: 'hidden',
  },
  mapFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 32,
  },
  // The pickup/dropoff phase's own top overlay — back button + a short
  // instruction pill, both riding on the map itself (§7: guidance belongs
  // near where the user is already looking, not buried in the card).
  selectionTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  selectionInstructionCard: {
    flex: 1,
    padding: spacing.md,
    gap: 2,
  },
  card: {
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    flex: 1,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
  },
  // Matches explore.tsx's `bottomWrap`-anchored card: absolute + bottom: 0
  // removes it from flex flow (the base style's `flex: 1` becomes a no-op),
  // so it sizes to its own content and hugs the bottom of the screen
  // instead of stretching to fill whatever height the map above it isn't
  // using.
  cardFormOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  handle: {
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  // The compact confirm bar shown in the card while pickup/dropoff
  // selection is active — deliberately small (§8: "a compact confirmation
  // control that does not unnecessarily obstruct the map"), since the map
  // above it has just grown to fill nearly the whole screen.
  selectionCardContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  selectionConfirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.sm,
  },
  confirmIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmTextCol: {
    flex: 1,
  },
  // The "add stops" phase's own card content — a horizontally-scrolling
  // row of suggested/added stop chips plus a trailing "add your own" chip,
  // sized to fit within STOPS_CARD_HEIGHT (taller than the single-confirm
  // pickup/dropoff card, see that constant's own doc comment).
  stopsPhaseContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  stopsLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  stopsChipRowContent: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  stopChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1.5,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: 180,
  },
  addStopsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  stopChipTextCol: {
    flexShrink: 1,
  },
  stopChipLabel: {
    maxWidth: 130,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  stepHeader: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'],
  },
  formStack: {
    gap: spacing.sm,
  },
  // Matches (tabs)/explore.tsx's headline style exactly — centered, no
  // extra top margin (the formStack's own gap already spaces it from the
  // handle above).
  headline: {
    marginTop: 0,
    textAlign: 'center',
  },
  eyebrow: {
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 1.5,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
    textTransform: 'uppercase',
  },
  // Exact copy of explore.tsx's locationBlock/connectorCol/connectorLine/
  // locationRow/locationIconWrap/locationTextCol/swapBtn — same values,
  // same names, so a future Search style change is easy to notice should
  // stay in sync here too.
  locationBlock: {
    position: 'relative',
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.md,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  connectorCol: {
    position: 'absolute',
    left: spacing.md + 15,
    top: spacing.md + 40,
    bottom: spacing.md + 8,
    width: 2,
  },
  connectorLine: {
    flex: 1,
    width: 0,
    borderLeftWidth: 2,
    borderStyle: 'dashed',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  locationIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationTextCol: {
    flex: 1,
    gap: 1,
  },
  swapBtn: {
    position: 'absolute',
    right: spacing.md,
    top: '50%',
    marginTop: -19,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formError: {
    marginBottom: spacing.xs,
  },
  // Matches explore.tsx's paramsGrid/paramBtn/paramBtnWide exactly (§14.1
  // guidance above) — Date/Heure sit side by side, Places disponibles is a
  // full-width row beneath, none of them wrapped in a second card.
  paramsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  paramBtn: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.md,
  },
  paramBtnWide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.md,
  },
  seatsIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    width: '100%',
  },
  outlineBtn: {
    width: '100%',
    minHeight: 52,
    borderRadius: radii.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceBody: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  priceCard: {
    padding: spacing.lg,
  },
  // Route-selection step: a persistent map (all alternatives drawn at
  // once, Google/Waze-picker style) filling the space between the header
  // and the option-list sheet below it.
  routeMapSection: {
    flex: 1,
    position: 'relative',
  },
  routeSheet: {
    maxHeight: '48%',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  routeList: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  stopsBody: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  stopsLoading: {
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
  },
  mapShadowWrap: {
    flex: 1,
    minHeight: 280,
    borderRadius: radii.xl,
  },
  mapWrap: {
    flex: 1,
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  originDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  destinationDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  hint: {
    marginTop: spacing.xs,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  sheetContent: {
    gap: spacing.lg,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  reviewContent: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'],
  },
  reviewStack: {
    gap: spacing.md,
  },
  reviewTitle: {
    fontWeight: typography.fontWeight.bold,
  },
  reviewSubtitle: {
    marginBottom: spacing.sm,
  },
  reviewCard: {
    padding: spacing.lg,
  },
  reviewCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  reviewCardEyebrow: {
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  reviewEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  reviewRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  reviewHalfCard: {
    flex: 1,
  },
  reviewStatRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  reviewUnit: {
    paddingBottom: 2,
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  vehiclePendingText: {
    flex: 1,
  },
  seatIcons: {
    flexDirection: 'row',
    gap: 2,
    marginLeft: spacing.xs,
  },
  timeline: {
    position: 'relative',
    paddingLeft: spacing.xl,
  },
  timelineLine: {
    position: 'absolute',
    left: 7,
    top: 8,
    bottom: 8,
    width: 2,
  },
  timelineRow: {
    marginBottom: spacing.md,
  },
  timelineRowContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  timelineText: {
    flex: 1,
  },
  timelineTime: {
    fontWeight: typography.fontWeight.semibold,
  },
  timelineDot: {
    position: 'absolute',
    left: -spacing.xl,
    top: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
  },
  timelineDotDestination: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  timelineDotDestinationInner: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  stopsSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },
  stopsSummaryText: {
    flex: 1,
  },
  timelineDotStop: {
    position: 'absolute',
    left: -spacing.xl + 3,
    top: 5,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  vehicleSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  vehicleSummaryIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  termsHint: {
    marginTop: spacing.sm,
  },
  termsHintLink: {
    textDecorationLine: 'underline',
  },
  verificationSheet: {
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  verificationIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  verificationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },
});
