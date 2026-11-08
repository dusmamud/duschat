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

const DUS_THEME: ThemeOverride = {
  palette: {
    'bg-primary': '#0b0d14',
    'bg-secondary': '#07080d',
    'bg-primary-active': '#1a1e28',
    'accent-primary': AMBER,
    'accent-primary-active': '#f0b45c',
    'icons-primary': '#eef0f5',
    'icons-secondary': '#a3a9b8',
    'borders-secondary': '#1a1e28',
    'borders-primary': '#1a1e28',
    'text-primary': '#eef0f5',
    'text-secondary': '#a3a9b8',
  },
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
    <div className="fixed inset-0 z-[70] h-dvh w-full bg-deep" role="dialog" aria-modal="true" aria-label="Edit image">
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
