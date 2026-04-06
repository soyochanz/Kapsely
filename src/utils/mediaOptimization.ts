import * as ImageManipulator from 'expo-image-manipulator';

export const UPLOAD_IMAGE_MAX_WIDTH = 1440;
export const UPLOAD_IMAGE_QUALITY = 0.72;

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

