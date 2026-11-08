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

/** 12 crop ratio presets — the crop tool stays free-form until one is picked. */
const CROP_PRESETS = [
  { titleKey: 'cropSquare', descriptionKey: '1:1', ratio: 1 },
  { titleKey: 'cropClassicTv', descriptionKey: '4:3', ratio: 4 / 3 },
  { titleKey: 'cropPortraitTv', descriptionKey: '3:4', ratio: 3 / 4 },
  { titleKey: 'cropWidescreen', descriptionKey: '16:9', ratio: 16 / 9 },
  { titleKey: 'cropStory', descriptionKey: '9:16', ratio: 9 / 16 },
  { titleKey: 'cropPhoto', descriptionKey: '3:2', ratio: 3 / 2 },
  { titleKey: 'cropPhotoPortrait', descriptionKey: '2:3', ratio: 2 / 3 },
  { titleKey: 'cropFeedPortrait', descriptionKey: '4:5', ratio: 4 / 5 },
  { titleKey: 'cropFeedLandscape', descriptionKey: '5:4', ratio: 5 / 4 },
  { titleKey: 'cropCinemascope', descriptionKey: '21:9', ratio: 21 / 9 },
  { titleKey: 'cropPanorama', descriptionKey: '2:1', ratio: 2 },
  { titleKey: 'cropWidePhoto', descriptionKey: '7:5', ratio: 7 / 5 },
]

const CROP_TRANSLATIONS = {
  cropSquare: 'Square',
  cropClassicTv: 'Classic TV',
  cropPortraitTv: 'Portrait TV',
  cropWidescreen: 'Widescreen',
  cropStory: 'Story',
  cropPhoto: 'Photo',
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
export default function ImageEditor({ source, fileName, fileType, onSave, onClose }: ImageEditorProps) {
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
        Crop={{ presetsItems: CROP_PRESETS }}
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
        savingPixelRatio={2}
        previewPixelRatio={typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1}
        closeAfterSave
        disableSaveIfNoChanges
        onSave={async (saved) => {
          const mimeType = saved.mimeType || 'image/png'
          const ext = saved.extension || mimeType.split('/')[1] || 'png'
          let blob: Blob | null = null
          if (saved.imageBase64) {
            blob = await (await fetch(saved.imageBase64)).blob()
          } else if (saved.imageCanvas) {
            blob = await new Promise<Blob | null>((resolve) =>
              saved.imageCanvas!.toBlob((b) => resolve(b), mimeType, 0.92),
            )
          }
          if (!blob) return
          onSave(new File([blob], `${baseName}.${ext}`, { type: blob.type || mimeType }))
        }}
        onClose={() => onClose()}
      />
    </div>
  )
}
