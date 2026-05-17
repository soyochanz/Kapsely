import * as Location from 'expo-location';

export const locationService = {
    async requestPermissions() {
        const { status } = await Location.requestForegroundPermissionsAsync();
        return status === 'granted';
    },

    async getCurrentLocation() {
        try {
            const hasPermission = await this.requestPermissions();
            if (!hasPermission) return null;

            const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });

            const [address] = await Location.reverseGeocodeAsync({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
            });

            return {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                altitude: location.coords.altitude,
                locationName:
                    address?.city ||
                    address?.district ||
                    address?.subregion ||
                    address?.region ||
                    address?.name ||
                    address?.country ||
                    'Ubicación actual'
            };
        } catch (e) {
            return null;
        }
    },

    async searchLocation(query: string) {
        try {
            const results = await Location.geocodeAsync(query);
            if (results.length > 0) {
                const [first] = results;
                const [address] = await Location.reverseGeocodeAsync({
                    latitude: first.latitude,
                    longitude: first.longitude,
                });
                return {
                    latitude: first.latitude,
                    longitude: first.longitude,
                    altitude: null,
                    locationName: address?.city || address?.subregion || address?.region || query
                };
            }
            return null;
        } catch (e) {
            return null;
        }
    },

    async getLocationFromExif(exif: any) {
        if (!exif || (!exif.GPSLatitude && !exif[6])) return null;
        
        // ImagePicker EXIF sometimes uses keys like '6' and '4' for GPS
        let lat = exif.GPSLatitude || exif[2];
        let lon = exif.GPSLongitude || exif[4];
        let latRef = exif.GPSLatitudeRef || exif[1];
        let lonRef = exif.GPSLongitudeRef || exif[3];

        if (!lat || !lon) return null;

        // Convert to decimal degrees if it's an array or string
        const toDecimal = (val: any, ref: string) => {
            let res = val;
            if (Array.isArray(val)) {
                res = val[0] + val[1]/60 + val[2]/3600;
            }
            if (ref === 'S' || ref === 'W') res = -res;
            return res;
        };

        const latitude = toDecimal(lat, latRef);
        const longitude = toDecimal(lon, lonRef);

        const [address] = await Location.reverseGeocodeAsync({ latitude, longitude });
        const locationName =
            address?.city ||
            address?.district ||
            address?.subregion ||
            address?.region ||
            address?.name ||
            address?.country ||
            `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        return {
            latitude,
            longitude,
            altitude: exif.GPSAltitude || null,
            locationName,
        };
    }
};
