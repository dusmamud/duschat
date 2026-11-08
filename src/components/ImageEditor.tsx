import FilerobotImageEditor, { TABS, TOOLS } from 'react-filerobot-image-editor'
import type { ThemeOverride } from '@scaleflex/ui/theme/entity'

interface ImageEditorProps {
  /** Object URL of the staged image. */
  source: string
  fileName: string
  fileType: string
  /** Called with the edited image file; the editor closes itself first. */
  onSave: (file: File) => void
  onClose: () => void
  /** Shown in the composer when the export itself fails — never silent. */
  onError: (message: string) => void
}

const AMBER = '#e8a33d'
const AMBER_HOVER = '#f0b45c'
const AMBER_ACTIVE = '#d18f2e'
const INK_DEEP = '#07080d'
const INK_SURFACE = '#0b0d14'
const INK_RAISED = '#11141c'
const INK_ACTIVE = '#1a1e28'
const INK_LINE = '#2a2f3d'
const TEXT_PRIMARY = '#eef0f5'
const TEXT_SECONDARY = '#a3a9b8'
const TEXT_MUTED = '#7a8296'

/**
 * Full Dus theme for the editor, mapped from the app's ink + lamplight
 * ramp (same tokens as src/index.css). Audit of what the old 11-token
 * theme missed, verified against the installed @scaleflex/ui default
 * palette (light theme) and the editor bundle's own palette reads:
 *
 * 1. Three wrong keys — 'text-primary' / 'text-secondary' /
 *    'icons-primary' do not exist in the Color enum; the real keys are
 *    'txt-primary' / 'txt-secondary' / 'icon-primary'. The old keys were
 *    silently ignored, so labels fell back to dark slate
 *    rgba(55,65,75,1) on the dark background and icons to grey-blue.
 * 2. Indigo leak — 'accent-stateless' (7 uses: sliders, active tabs,
 *    spinner) and 'accent-0-7-opacity' were still the default indigo
 *    #6879EB, and the flat 'indigo' / 'violet' / 'modified' colors too.
 * 3. White surfaces leak — 'bg-stateless' (4 uses) and 'bg-active' were
 *    still white / near-white on a dark screen.
 * 4. Light borders + bluish shadows — 'borders-item',
 *    'border-primary-stateless', 'borders-disabled' (indigo-tinted),
 *    'light-shadow' were all still light-theme values.
 * 5. White fade washes — the 'gradient-right' family (toolbar scroll
 *    fades) were white gradients.
 * 6. Wrong font + tiny radii — Roboto default, radii 2/4/8px.
 *
 * Every token the editor bundle actually reads is set here, so nothing
 * falls back to the light default. The library itself also reads the
 * misspelled 'access-primary' in two places, so that key is set too.
 * The Save button gets dark text on amber (4.5:1+), matching the app's
 * off-white button with dark text.
 */
const DUS_THEME: ThemeOverride = {
  palette: {
    // Backgrounds — ink ramp, deepest to raised.
    'bg-primary': INK_SURFACE,
    'bg-secondary': INK_DEEP,
    'bg-primary-active': INK_ACTIVE,
    'bg-primary-hover': INK_RAISED,
    'bg-primary-light': INK_RAISED,
    'bg-primary-stateless': INK_RAISED,
    'bg-primary-0-5-opacity': 'rgba(11, 13, 20, 0.5)',
    'bg-stateless': INK_RAISED,
    'bg-hover': INK_RAISED,
    'bg-active': INK_ACTIVE,
    'bg-grey': INK_ACTIVE,
    'bg-base-light': INK_RAISED,
    'bg-base-medium': INK_ACTIVE,
    'bg-tooltip': INK_ACTIVE,
    'bg-green': 'rgba(76, 175, 120, 0.1)',
    'bg-green-medium': 'rgba(76, 175, 120, 0.18)',
    'bg-blue': INK_RAISED,
    'bg-red': 'rgba(217, 95, 95, 0.1)',
    'bg-red-light': 'rgba(217, 95, 95, 0.08)',
    'background-red-medium': 'rgba(217, 95, 95, 0.18)',
    'bg-orange': 'rgba(232, 163, 61, 0.1)',
    // Accent — one warm amber, no indigo anywhere.
    'accent-primary': AMBER,
    'accent-primary-hover': AMBER_HOVER,
    'accent-primary-active': AMBER_ACTIVE,
    'accent-primary-disabled': '#3a3f4d',
    'accent-secondary-disabled': INK_ACTIVE,
    'accent-stateless': AMBER,
    'accent-stateless_0_4_opacity': 'rgba(232, 163, 61, 0.4)',
    'accent_0_5_5_opacity': 'rgba(232, 163, 61, 0.55)',
    'accent_0_7_opacity': 'rgba(232, 163, 61, 0.7)',
    'accent_0_5_opacity': 'rgba(232, 163, 61, 0.05)',
    'accent_1_2_opacity': 'rgba(232, 163, 61, 0.12)',
    'accent_1_8_opacity': 'rgba(232, 163, 61, 0.18)',
    'accent_2_8_opacity': 'rgba(232, 163, 61, 0.28)',
    'accent_4_0_opacity': 'rgba(232, 163, 61, 0.4)',
    // Library typo: two styled rules read 'access-primary'.
    'access-primary': AMBER,
    // Text — three roles only, correct key names ('txt-*', not 'text-*').
    'txt-primary': TEXT_PRIMARY,
    'txt-secondary': TEXT_SECONDARY,
    'txt-secondary-invert': INK_DEEP,
    'txt-placeholder': TEXT_MUTED,
    'txt-warning': AMBER,
    'txt-error': '#d95f5f',
    'txt-info': '#8fa3b8',
    // Icons — the library reads both 'icon-primary' and 'icons-primary'.
    'icon-primary': TEXT_PRIMARY,
    'icons-primary': TEXT_PRIMARY,
    'icons-primary-opacity-0-6': 'rgba(238, 240, 245, 0.6)',
    'icons-secondary': TEXT_SECONDARY,
    'icons-placeholder': TEXT_MUTED,
    'icons-invert': INK_DEEP,
    'icons-muted': TEXT_MUTED,
    'icons-primary-hover': TEXT_PRIMARY,
    'icons-secondary-hover': TEXT_PRIMARY,
    // Buttons — dark text on the amber primary button, like the app.
    'btn-primary-text': INK_DEEP,
    'btn-primary-text-0-6': 'rgba(7, 8, 13, 0.6)',
    'btn-primary-text-0-4': 'rgba(7, 8, 13, 0.4)',
    'btn-disabled-text': TEXT_MUTED,
    'btn-secondary-text': TEXT_PRIMARY,
    // Links.
    'link-primary': AMBER,
    'link-stateless': TEXT_SECONDARY,
    'link-hover': AMBER_HOVER,
    'link-active': AMBER_ACTIVE,
    'link-muted': TEXT_MUTED,
    'link-pressed': AMBER,
    link: AMBER,
    // Borders — quiet hairlines from the ramp.
    'borders-primary': INK_ACTIVE,
    'borders-primary-hover': INK_LINE,
    'borders-secondary': INK_ACTIVE,
    'borders-strong': INK_LINE,
    'borders-invert': INK_ACTIVE,
    'border-hover-bottom': 'rgba(232, 163, 61, 0.18)',
    'border-active-bottom': AMBER,
    'border-primary-stateless': INK_ACTIVE,
    'borders-disabled': 'rgba(122, 130, 150, 0.4)',
    'borders-button': INK_LINE,
    'borders-item': INK_ACTIVE,
    'borders-base-light': INK_ACTIVE,
    'borders-base-medium': INK_LINE,
    'borders-green': 'rgba(76, 175, 120, 0.22)',
    'borders-green-medium': 'rgba(76, 175, 120, 0.4)',
    'borders-red': 'rgba(217, 95, 95, 0.4)',
    // States — toned down to sit inside the palette.
    error: '#d95f5f',
    'error-0-28-opacity': 'rgba(217, 95, 95, 0.28)',
    'error-0-12-opacity': 'rgba(217, 95, 95, 0.12)',
    'error-hover': '#c94f4f',
    'error-active': '#b84343',
    success: '#4caf78',
    'success-hover': '#3f9a68',
    'success-Active': '#357f57',
    warning: AMBER,
    'warning-hover': AMBER_ACTIVE,
    'warning-active': '#b57a24',
    info: '#8fa3b8',
    modified: AMBER,
    'active-secondary': INK_ACTIVE,
    'active-secondary-hover': 'rgba(232, 163, 61, 0.05)',
    tag: TEXT_MUTED,
    'states-error-disabled-text': 'rgba(217, 95, 95, 0.3)',
    // Flat colors — violet and blue mapped into the palette.
    red: '#d95f5f',
    orange: AMBER,
    salad: '#6da06a',
    green: '#4caf78',
    blue: '#8fa3b8',
    indigo: AMBER,
    violet: AMBER,
    pink: '#c98a8a',
    // Fades and overlays — ink, never white.
    'gradient-right':
      'linear-gradient(270deg, #0b0d14 1.56%, rgba(11, 13, 20, 0.89) 52.4%, rgba(11, 13, 20, 0.53) 76.04%, rgba(11, 13, 20, 0) 100%)',
    'gradient-right-active':
      'linear-gradient(270deg, #1a1e28 1.56%, #1a1e28 52.4%, rgba(26, 30, 40, 0.53) 76.04%, rgba(26, 30, 40, 0) 100%)',
    'gradient-right-hover':
      'linear-gradient(270deg, #11141c 1.56%, #11141c 52.4%, rgba(17, 20, 28, 0.53) 76.04%, rgba(17, 20, 28, 0) 100%)',
    'extra-0-3-overlay': 'rgba(7, 8, 13, 0.3)',
    'extra-0-5-overlay': 'rgba(7, 8, 13, 0.5)',
    'extra-0-7-overlay': 'rgba(7, 8, 13, 0.7)',
    'extra-0-9-overlay': 'rgba(7, 8, 13, 0.9)',
    'red-0-1-overlay': 'rgba(217, 95, 95, 0.1)',
    'orange-0-1-overlay': 'rgba(232, 163, 61, 0.1)',
    'accent-0-8-overlay': 'rgba(232, 163, 61, 0.08)',
    'green-0-2-overlay': 'rgba(76, 175, 120, 0.2)',
    'white-0-7-8-overlay': 'rgba(7, 8, 13, 0.78)',
    // Shadows — neutral dark, depth from surface steps, not glow.
    'light-shadow': 'rgba(0, 0, 0, 0.3)',
    'medium-shadow': 'rgba(0, 0, 0, 0.4)',
    'large-shadow': 'rgba(0, 0, 0, 0.5)',
    'x-large-shadow': 'rgba(0, 0, 0, 0.6)',
    // Upload-source brand colors — unused in our flow (no source
    // picker), but the violet ones must never leak if ever rendered.
    camera: TEXT_SECONDARY,
    'google-drive': TEXT_SECONDARY,
    dropbox: TEXT_SECONDARY,
    'one-drive': TEXT_SECONDARY,
    device: TEXT_SECONDARY,
    instagram: TEXT_SECONDARY,
    unsplash: TEXT_SECONDARY,
    'free-images': TEXT_SECONDARY,
    'free-icons': TEXT_SECONDARY,
    canvas: AMBER,
    box: TEXT_SECONDARY,
    'screen-cast': TEXT_MUTED,
  },
  // The theme deep-merges onto the default, so a partial typography /
  // shape is enough at runtime; the casts keep TypeScript quiet.
  typography: { fontFamily: 'Instrument Sans, Arial' } as ThemeOverride['typography'],
  shape: { borderRadius: { sm: '4px', md: '8px', lg: '12px' } } as ThemeOverride['shape'],
}

/**
 * 12 crop ratio presets, grouped into 3 folders.
 * Why folders: Filerobot renders every flat preset in ONE dropdown that
 * pops up from the bottom toolbar — 17 rows (5 built-in + 12 mine) is
 * taller than a short viewport, so the top presets (Square 1:1 first)
 * were clipped off-screen and unreachable. Grouped, the top menu is
 * only 8 rows (3 folders + 5 built-ins) and every preset stays reachable.
 */
const CROP_PRESET_FOLDERS = [
  {
    titleKey: 'cropCommon',
    groups: [
      {
        titleKey: 'cropCommonGroup',
        items: [
          { titleKey: 'cropSquare', descriptionKey: '1:1', ratio: 1 },
          { titleKey: 'cropClassicTv', descriptionKey: '4:3', ratio: 4 / 3 },
          { titleKey: 'cropPortraitTv', descriptionKey: '3:4', ratio: 3 / 4 },
          { titleKey: 'cropWidescreen', descriptionKey: '16:9', ratio: 16 / 9 },
          { titleKey: 'cropStory', descriptionKey: '9:16', ratio: 9 / 16 },
        ],
      },
    ],
  },
  {
    titleKey: 'cropPhoto',
    groups: [
      {
        titleKey: 'cropPhotoGroup',
        items: [
          { titleKey: 'cropPhotoLandscape', descriptionKey: '3:2', ratio: 3 / 2 },
          { titleKey: 'cropPhotoPortrait', descriptionKey: '2:3', ratio: 2 / 3 },
          { titleKey: 'cropFeedPortrait', descriptionKey: '4:5', ratio: 4 / 5 },
          { titleKey: 'cropFeedLandscape', descriptionKey: '5:4', ratio: 5 / 4 },
        ],
      },
    ],
  },
  {
    titleKey: 'cropWide',
    groups: [
      {
        titleKey: 'cropWideGroup',
        items: [
          { titleKey: 'cropCinemascope', descriptionKey: '21:9', ratio: 21 / 9 },
          { titleKey: 'cropPanorama', descriptionKey: '2:1', ratio: 2 },
          { titleKey: 'cropWidePhoto', descriptionKey: '7:5', ratio: 7 / 5 },
        ],
      },
    ],
  },
]

const CROP_TRANSLATIONS = {
  cropCommon: 'Common',
  cropCommonGroup: 'Common ratios',
  cropPhoto: 'Photo',
  cropPhotoGroup: 'Photo ratios',
  cropWide: 'Wide',
  cropWideGroup: 'Wide ratios',
  cropSquare: 'Square',
  cropClassicTv: 'Classic TV',
  cropPortraitTv: 'Portrait TV',
  cropWidescreen: 'Widescreen',
  cropStory: 'Story',
  cropPhotoLandscape: 'Photo landscape',
  cropPhotoPortrait: 'Photo portrait',
  cropFeedPortrait: 'Feed portrait',
  cropFeedLandscape: 'Feed landscape',
  cropCinemascope: 'Cinemascope',
  cropPanorama: 'Panorama',
  cropWidePhoto: 'Wide photo',
}

/**
 * Full-screen image editor (Filerobot, lazy-loaded so it never touches the
 * initial bundle). Crop with 12 ratio presets, rotate/flip, finetune,
 * filters, resize, and annotate: pen, arrow, line, rectangle, ellipse,
 * polygon, text. Saving exports at high resolution; the edited file
 * replaces the staged one in the composer.
 */
export default function ImageEditor({ source, fileName, fileType, onSave, onClose, onError }: ImageEditorProps) {
  const baseName = fileName.replace(/\.[^.]*$/, '') || 'image'
  const savedType =
    fileType === 'image/jpeg' || fileType === 'image/jpg'
      ? 'jpeg'
      : fileType === 'image/webp'
        ? 'webp'
        : 'png'

  return (
    <div className="dus-image-editor fixed inset-0 z-[70] h-dvh w-full bg-deep" role="dialog" aria-modal="true" aria-label="Edit image">
      <FilerobotImageEditor
        source={source}
        theme={DUS_THEME}
        tabsIds={[TABS.ADJUST, TABS.FINETUNE, TABS.FILTERS, TABS.ANNOTATE, TABS.RESIZE]}
        defaultTabId={TABS.ADJUST}
        defaultToolId={TOOLS.CROP}
        Crop={{ presetsFolders: CROP_PRESET_FOLDERS }}
        translations={CROP_TRANSLATIONS}
        annotationsCommon={{ fill: AMBER, stroke: AMBER, strokeWidth: 3 }}
        Pen={{ strokeWidth: 3, lineCap: 'round' }}
        Arrow={{ strokeWidth: 4, lineCap: 'round' }}
        Line={{ strokeWidth: 3, lineCap: 'round' }}
        Text={{ text: 'Text', fontSize: 24, fontFamily: 'Instrument Sans, Arial' }}
        Rotate={{ angle: 90, componentType: 'slider' }}
        defaultSavedImageName={baseName}
        defaultSavedImageType={savedType}
        defaultSavedImageQuality={0.92}
        // Export at the original resolution: 2x upscales a phone photo to
        // ~8000px and the giant base64 export stalls or dies. The upload
        // step downscales to 1600px webp anyway, so 1x loses nothing.
        savingPixelRatio={1}
        previewPixelRatio={typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1}
        closeAfterSave
        disableSaveIfNoChanges
        onSave={async (saved) => {
          const mimeType = saved.mimeType || 'image/png'
          const ext = saved.extension || mimeType.split('/')[1] || 'png'
          try {
            let blob: Blob | null = null
            if (saved.imageCanvas) {
              // Primary path: the exported canvas is already in memory.
              // toBlob avoids the giant base64 string + fetch round-trip
              // that made big phone photos slow or fail to come back.
              blob = await new Promise<Blob | null>((resolve) =>
                saved.imageCanvas!.toBlob((b) => resolve(b), mimeType, 0.92),
              )
            }
            if (!blob && saved.imageBase64) {
              blob = await (await fetch(saved.imageBase64)).blob()
            }
            if (!blob) throw new Error('Could not export the edited image.')
            onSave(new File([blob], `${baseName}.${ext}`, { type: blob.type || mimeType }))
          } catch (err) {
            onError(err instanceof Error ? err.message : 'Could not save the edited image.')
          }
        }}
        onClose={() => onClose()}
      />
    </div>
  )
}
