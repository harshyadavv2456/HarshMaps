export declare const OVERTURE_TILES_BASE: string;
export declare const OVERTURE_PLACES_SOURCE_ID: string;
export declare const OVERTURE_PLACES_DOTS_ID: string;
export declare const OVERTURE_PLACES_LABELS_ID: string;
export declare const OVERTURE_PLACES_ATTRIBUTION: string;
export type PlaceCategory = 'all' | 'food' | 'shopping' | 'health' | 'banks' | 'education' | 'lodging' | 'landmarks' | 'services';
export declare const PLACE_CATEGORY_GROUPS: Readonly<Record<PlaceCategory, readonly string[] | null>>;
export declare function validOvertureRelease(value: unknown): value is string;
export declare function overturePlacesUrl(release: string): string;
export interface OverturePlacesOptions { sourceId?: string; dotsLayerId?: string; labelsLayerId?: string; category?: PlaceCategory; visible?: boolean; }
export declare function addOverturePlaces(map: any, release: string, options?: OverturePlacesOptions): { sourceId: string; dotsId: string; labelsId: string; release: string; url: string };
export declare function setOverturePlaceCategory(map: any, category?: PlaceCategory, options?: { dotsId?: string; labelsId?: string }): PlaceCategory;
export declare function setOverturePlacesVisible(map: any, visible: boolean, options?: { dotsId?: string; labelsId?: string }): boolean;
export declare function bindOverturePlacePopups(map: any, maplibregl: { Popup: new (options?: any) => any }, options?: { dotsId?: string }): void;
