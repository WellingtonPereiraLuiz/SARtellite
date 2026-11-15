export type LngLat = [number, number];
export type Corners = [LngLat, LngLat, LngLat, LngLat];
export type SensorKey = 'nisar' | 's1' | 's2';
export type Evidence = 'preview' | 'real';

export interface NisarScene {
  id: string; sensor: 'NISAR'; band: string; product: string; product_id: string; acquired_at: string;
  polarization: string; polarizations_available: string[]; processing_maturity: string; crid: string;
  pge_version: string; processed_at: string; path: number; frame: number; direction: string; orbit: number;
  resolution_m: number; image_frame: string; image_aoi: string; evidence: Evidence; h5_url: string;
  h5_bytes: number; source_url: string; rain_30d_before_mm: number;
}
export interface S1Scene {
  id: string; sensor: 'Sentinel-1'; band: string; product: string; product_id: string; acquired_at: string;
  platform: string; orbit_state: string; relative_orbit: number; polarizations: string[]; resolution_m: number;
  image_vh: string; db_range_vh: [number, number];
  mean_vh_db: number; mean_vv_db: number; source_url: string; evidence: Evidence;
}
export interface S2Scene {
  id: string; sensor: 'Sentinel-2'; product: string; product_ids: string[]; acquired_at: string; platform: string;
  resolution_m: number; cloud_fraction_aoi: number; image_rgb: string; water_mask: string; water_area_ha: number;
  water_method: string; mean_ndvi_clear: number | null; source_url: string; evidence: Evidence;
}
export interface Corroboration {
  image: string; optical_before: string; optical_after: string; ndvi_drop_threshold: number; area_ha: number;
  area_ha_in_trees_class: number; share_of_radar_drop_checked: number; share_of_radar_drop_confirmed: number;
}
export interface Aoi {
  id: string; label: string; place: string; why: string; center: LngLat; size_km: number; res_m: number;
  epsg: number; utm_bounds: number[]; corners: Corners; pixels: number; coverage_confirmed: boolean;
  scenes: { nisar: NisarScene[]; s1: S1Scene[]; s2: S2Scene[] };
  s2_cloud_table: { date: string; coverage: number; cloud_fraction_aoi: number }[];
  nisar_diff: { image: string; share_drop: number; share_rise: number };
  reference: {
    lulc: { item: string; year: string; class_shares: Record<string, number>; image_forest: string; source_url: string };
    jrc: { items: string[]; period: string; image: string; area_ha_occ_ge_50: number; area_ha_occ_ge_5: number; source_url: string };
  };
  rain: { source: string; source_url: string; units: string; days: { date: string; mm: number | null }[]; total_between_nisar_mm: number };
  fires: { count_window: number; count_between_nisar: number };
  analysis: {
    s1_pair: { before: string; after: string; relative_orbit: number; days_from_nisar: [number, number] };
    polarization: string; reference_offset_db: number; reference: string; threshold_db: number;
    area_ha_by_threshold: Record<string, number>; area_ha_by_class: Record<string, number>; aoi_area_ha: number;
    corroboration: Corroboration | null; evidence: string; caveat: string;
  };
}
export interface Manifest {
  project: string; team: string; is_demo: boolean; generated_at: string; pipeline_commit: string | null;
  window: [string, string];
  nisar_frame: {
    path: number; frame: number; direction: string; footprints: Record<string, LngLat[]>; image_corners: Corners;
    utm_rect: number[]; epsg: number; pixel_m: number; grid_check: { method: string; shift_px: number[]; peak: number };
    images: Record<string, string>;
    diff: { image: string; offset_dn: number; floor_dn: number; full_dn: number; share_drop: number; share_rise: number; method: string };
  };
  basemap: { tile_sources: Record<string, { minzoom: number; maxzoom: number; bounds?: number[] }>; font: string };
  fires: { file: string; count: number; months: Record<string, number | string> };
  aois: Aoi[];
}
export interface FiresFile { source: string; source_url: string; rows: [number, number, string, string, number | null][] }

/** Cena unificada usada pela linha do tempo e pelo mapa. */
export interface Scene {
  id: string; key: SensorKey; sensorLabel: string; date: string; acquiredAt: string; title: string;
  image: string; corners: Corners; evidence: Evidence; quality: string; orbit?: number;
  raw: NisarScene | S1Scene | S2Scene;
}
export interface CustomArea { lat: number; lon: number; radiusKm: number }
export type CompareMode = 'swipe' | 'toggle' | 'delta';
export interface LayerState { change: boolean; corroborated: boolean; forest: boolean; water: boolean; waterHist: boolean; fires: boolean; rain: boolean }
