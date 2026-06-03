import {
  component$,
  useSignal,
  useStyles$,
  $,
  useTask$,
  isBrowser,
  type QRL,
  noSerialize,
  type NoSerialize,
} from "@builder.io/qwik";
import Cropper from "cropperjs";
import { translate, useI18n } from "~/contexts/i18n";

// Import cropperjs styles
import cropperStyles from "cropperjs/dist/cropper.css?inline";

interface AvatarCropperProps {
  imageSrc: string;
  onConfirm$: QRL<(result: string) => void>;
  onCancel$: QRL<() => void>;
}

export const AvatarCropper = component$((props: AvatarCropperProps) => {
  useStyles$(cropperStyles);
  const i18n = useI18n();

  const imageRef = useSignal<HTMLImageElement>();
  const cropperRef = useSignal<NoSerialize<Cropper>>();
  const isImageLoaded = useSignal(false);

  // Reset loaded state when src changes
  useTask$(({ track }) => {
    track(() => props.imageSrc);
    isImageLoaded.value = false;
  });

  // Initialize cropper when image is loaded
  useTask$(({ track, cleanup }) => {
    const loaded = track(() => isImageLoaded.value);
    const imageEl = track(() => imageRef.value);

    if (isBrowser && loaded && imageEl) {
      // Destroy previous instance if exists
      if (cropperRef.value) {
        try {
          cropperRef.value.destroy();
        } catch (e) {
          console.error("AvatarCropper: Error destroying cropper", e);
        }
      }

      // Small timeout to ensure DOM is ready and layout is stable
      const timer = setTimeout(() => {
        try {
          const cropper = new Cropper(imageEl, {
            aspectRatio: 1,
            viewMode: 1,
            dragMode: "move",
            autoCropArea: 1,
            restore: false,
            modal: true,
            guides: false,
            highlight: false,
            cropBoxMovable: false,
            cropBoxResizable: false,
            toggleDragModeOnDblclick: false,
            minCropBoxWidth: 256,
            minCropBoxHeight: 256,
            ready() {},
          });
          cropperRef.value = noSerialize(cropper);
        } catch (e) {
          console.error("AvatarCropper: Error initializing cropper", e);
        }
      }, 50);

      cleanup(() => {
        clearTimeout(timer);
        cropperRef.value?.destroy();
      });
    }
  });

  const handleSave = $(() => {
    if (cropperRef.value) {
      // Defensive check for getCroppedCanvas
      if (typeof cropperRef.value.getCroppedCanvas !== "function") {
        console.error(
          "AvatarCropper: getCroppedCanvas is not a function on cropperRef.value",
          cropperRef.value,
        );
        // Try to debug usage
        return;
      }

      try {
        // Get cropped canvas
        const canvas = cropperRef.value.getCroppedCanvas({
          width: 512,
          height: 512,
          imageSmoothingEnabled: true,
          imageSmoothingQuality: "high",
        });

        if (!canvas) {
          console.error("AvatarCropper: getCroppedCanvas returned null");
          return;
        }

        // Convert to base64
        const base64 = canvas.toDataURL("image/png");
        props.onConfirm$(base64);
      } catch (e) {
        console.error("AvatarCropper: Error getting cropped canvas", e);
      }
    } else {
      console.warn(
        "AvatarCropper: handleSave called but cropperRef.value is not set",
      );
    }
  });

  return (
    <div class="z-50 fixed inset-0 flex justify-center items-center bg-black/80 backdrop-blur-sm">
      <div class="bg-white dark:bg-gray-900 shadow-2xl m-4 p-6 rounded-lg w-full max-w-lg">
        <h3 class="mb-4 font-bold text-gray-900 dark:text-white text-xl">
          {translate("profile.crop_avatar_title", i18n.currentLanguage)}
        </h3>

        <div class="relative bg-black mb-6 rounded-lg w-full h-96 overflow-hidden">
          <img
            ref={imageRef}
            src={props.imageSrc}
            alt="Crop preview"
            class="block max-w-full"
            width={512}
            height={512}
            style={{ opacity: 0 }} // Hide original image until loaded by cropper
            onLoad$={() => {
              isImageLoaded.value = true;
            }}
          />
        </div>

        <div class="flex justify-end space-x-4">
          <button onClick$={props.onCancel$} class="btn-cancel">
            {translate("common.cancel", i18n.currentLanguage)}
          </button>
          <button
            onClick$={handleSave}
            class="btn-primary"
            disabled={!isImageLoaded.value}
          >
            {translate("common.save", i18n.currentLanguage)}
          </button>
        </div>
      </div>
    </div>
  );
});
