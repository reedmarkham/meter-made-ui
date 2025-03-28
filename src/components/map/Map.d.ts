// components/map/Map.d.ts
declare module './map' {
    import { FC } from 'react';
  
    interface Point {
      x: number;
      y: number;
      result: number;
    }
  
    interface MapProps {
      isClient: boolean;
      mapData: GeoJSON.FeatureCollection;
      data: Point[];
    }
  
    const Map: FC<MapProps>;
  
    export default Map;
  }
  