/**
 * Geocoding utility functions for converting addresses to coordinates
 * Uses backend API (geopy) or free geocoding services
 */

export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
  placeId?: string;
}

const getBackendApiUrl = () => {
  const rawUrl = import.meta.env.VITE_BACKEND_API_URL || import.meta.env.REACT_APP_BACKEND_API_URL;
  return rawUrl ? rawUrl.replace(/\/+$/, "") : "";
};

/**
 * Geocode an address using backend API or Nominatim (OpenStreetMap)
 * @param address - The address to geocode
 * @returns Promise with lat/lng coordinates and formatted address
 */
export const geocodeAddress = async (address: string): Promise<GeocodeResult> => {
  // First, try backend API if configured
  const backendApiUrl = getBackendApiUrl();
  
  if (backendApiUrl) {
    try {
      const response = await fetch(`${backendApiUrl}/geocode/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ address }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.lat && data.lng) {
          return {
            lat: data.lat,
            lng: data.lng,
            formattedAddress: data.formatted_address || address,
            placeId: data.place_id,
          };
        }
      }
    } catch (error) {
      console.warn('Backend geocoding failed, falling back to Nominatim:', error);
    }
  }

  // Fallback to Nominatim (OpenStreetMap) - free, no API key required
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
      {
        headers: {
          'User-Agent': 'SharePlate/1.0', // Required by Nominatim
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Nominatim API returned ${response.status}`);
    }

    const data = await response.json();
    
    if (data && data.length > 0) {
      const result = data[0];
      return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        formattedAddress: result.display_name || address,
        placeId: result.place_id,
      };
    } else {
      throw new Error('No results found for this address');
    }
  } catch (error) {
    throw new Error(`Geocoding failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Initialize address autocomplete using a simple debounced search
 * Uses backend API if available, otherwise falls back to Nominatim (OpenStreetMap)
 */
export const initAutocomplete = (
  inputElement: HTMLInputElement | null,
  onPlaceSelect: (place: any) => void
): (() => void) | null => {
  if (!inputElement) return null;

  let timeoutId: NodeJS.Timeout | null = null;
  let abortController: AbortController | null = null;

  const backendApiUrl = getBackendApiUrl();

  const handleInput = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const query = target.value.trim();

    // Clear previous timeout and abort previous request
    if (timeoutId) clearTimeout(timeoutId);
    if (abortController) abortController.abort();

    if (query.length < 3) return; // Wait for at least 3 characters

    timeoutId = setTimeout(async () => {
      abortController = new AbortController();

      try {
        let results = [];

        // Try backend autocomplete first
        if (backendApiUrl) {
          try {
            const response = await fetch(
              `${backendApiUrl}/autocomplete/?q=${encodeURIComponent(query)}`,
              { signal: abortController.signal }
            );
            if (response.ok) {
              results = await response.json();
            }
          } catch (error) {
            if (error.name !== 'AbortError') {
              console.warn('Backend autocomplete failed:', error);
            }
          }
        }

        // Fallback to Nominatim for suggestions
        if (results.length === 0) {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
            {
              headers: {
                'User-Agent': 'SharePlate/1.0',
              },
              signal: abortController.signal,
            }
          );

          if (response.ok) {
            const data = await response.json();
            results = data.map((item: any) => ({
              lat: parseFloat(item.lat),
              lng: parseFloat(item.lon),
              formattedAddress: item.display_name,
              placeId: item.place_id,
              name: item.name,
            }));
          }
        }

        // Store first result in data attributes for easy access
        if (results.length > 0 && inputElement) {
          const firstResult = results[0];
          inputElement.setAttribute('data-lat', firstResult.lat.toString());
          inputElement.setAttribute('data-lng', firstResult.lng.toString());
          inputElement.setAttribute('data-place-id', firstResult.placeId?.toString() || '');
          
          // Call callback with the result
          onPlaceSelect(firstResult);
        }
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Autocomplete error:', error);
        }
      }
    }, 500); // Debounce for 500ms
  };

  inputElement.addEventListener('input', handleInput);

  // Return cleanup function
  return () => {
    if (timeoutId) clearTimeout(timeoutId);
    if (abortController) abortController.abort();
    inputElement.removeEventListener('input', handleInput);
  };
};
