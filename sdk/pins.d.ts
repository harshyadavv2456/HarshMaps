export interface Pin { id: string; lng: number | null | undefined; lat: number | null | undefined; [key: string]: unknown }
export interface PinClusterOptions { id?: string; pins?: Pin[]; onSelect?: (properties: Record<string, any>) => void; clusterRadius?: number; clusterMaxZoom?: number; colors?: { pin?: string; selected?: string; cluster?: string; text?: string } }
export interface PinClusters { setPins(pins: Pin[]): void; setSelected(id: string | null | undefined): void; fitToPins(pins: Pin[], padding?: number): void; remove(): void }
export declare function pinsToGeoJSON(pins: Pin[]): GeoJSON.FeatureCollection<GeoJSON.Point>;
export declare function addPinClusters(map: any, options?: PinClusterOptions): PinClusters;
