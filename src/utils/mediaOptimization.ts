import * as ImageManipulator from 'expo-image-manipulator';

export const UPLOAD_IMAGE_MAX_WIDTH = 2560;
export const UPLOAD_IMAGE_QUALITY = 0.88;

export const THUMBNAIL_MAX_WIDTH = 480;
export const THUMBNAIL_QUALITY = 0.65;

export async function optimizeImageForUpload(uri: string) {
    try {
        const optimized = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: UPLOAD_IMAGE_MAX_WIDTH } }],
            {
                compress: UPLOAD_IMAGE_QUALITY,
                format: ImageManipulator.SaveFormat.WEBP,
            }
        );
        return optimized.uri;
    } catch (error) {
        console.warn('Could not optimize image, using original file.', error);
        return uri;
    }
}

export async function optimizeThumbnailForUpload(uri: string) {
    try {
        const optimized = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: THUMBNAIL_MAX_WIDTH } }],
            {
                compress: THUMBNAIL_QUALITY,
                format: ImageManipulator.SaveFormat.WEBP,
            }
        );
        return optimized.uri;
    } catch (error) {
        console.warn('Could not optimize thumbnail, using original file.', error);
        return uri;
    }
}


