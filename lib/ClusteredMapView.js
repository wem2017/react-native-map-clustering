import React, {
  memo,
  useState,
  useEffect,
  useMemo,
  useRef,
  forwardRef,
} from "react";
import { Dimensions, LayoutAnimation, Platform } from "react-native";
import MapView, { Circle } from "react-native-maps";
import SuperCluster from "supercluster";
import ClusterMarker from "./ClusteredMarker";
import {
  isMarker,
  markerToGeoJSONFeature,
  calculateBBox,
  returnMapZoom,
} from "./helpers";

function CustomCircle({ onLayout, ...props }) {
  const ref = useRef();
  useEffect(() => {
    if (ref.current) {
      ref.current.setNativeProps({
        fillColor: props.fillColor,
        strokeColor: props.strokeColor,
      });
    }
  }, [ref.current]);

  return <Circle ref={ref} {...props} />;
}

const ClusteredMapView = forwardRef(
  (
    {
      radius,
      maxZoom,
      minZoom,
      minPoints,
      extent,
      nodeSize,
      children,
      onClusterPress,
      onRegionChangeComplete,
      onMarkersChange,
      preserveClusterPressBehavior,
      clusteringEnabled,
      clusterColor,
      clusterTextColor,
      clusterFontFamily,
      layoutAnimationConf,
      animationEnabled,
      renderCluster,
      tracksViewChanges,
      superClusterRef,
      ...restProps
    },
    ref
  ) => {
    const [markers, updateMarkers] = useState([]);
    const [superCluster, setSuperCluster] = useState(null);
    const [currentRegion, updateRegion] = useState(
      restProps.region || restProps.initialRegion
    );
    const mapRef = useRef();

    const propsChildren = useMemo(() => React.Children.toArray(children), [
      children,
    ]);

    useEffect(() => {
      const rawData = [];
      if (!clusteringEnabled) {
        updateMarkers([]);
        return;
      }

      React.Children.forEach(children, (child, index) => {
        if (isMarker(child)) {
          rawData.push(markerToGeoJSONFeature(child, index));
        }
      });

      const superCluster = new SuperCluster({
        minPoints,
        radius,
        maxZoom,
        minZoom,
        extent,
        nodeSize,
      });

      superCluster.load(rawData);

      const bBox = calculateBBox(currentRegion);
      const zoom = returnMapZoom(currentRegion, bBox, minZoom);
      const markers = superCluster.getClusters(bBox, zoom);

      updateMarkers(markers);
      setSuperCluster(superCluster);

      superClusterRef.current = superCluster;
    }, [
      children,
      restProps.region,
      restProps.initialRegion,
      clusteringEnabled,
    ]);

    const _onRegionChangeComplete = (region) => {
      if (superCluster) {
        const bBox = calculateBBox(region);
        const zoom = returnMapZoom(region, bBox, minZoom);
        const markers = superCluster.getClusters(bBox, zoom);

        if (animationEnabled && Platform.OS === "ios") {
          LayoutAnimation.configureNext(layoutAnimationConf);
        }

        updateMarkers(markers);
        onMarkersChange(markers);
        onRegionChangeComplete(region, markers);
        updateRegion(region);
      } else {
        onRegionChangeComplete(region);
      }
    };

    const _onClusterPress = (cluster) => () => {
      const children = superCluster.getLeaves(cluster.id, Infinity);

      if (preserveClusterPressBehavior) {
        onClusterPress(cluster, children);
        return;
      }

      const coordinates = children.map(({ geometry }) => ({
        latitude: geometry.coordinates[1],
        longitude: geometry.coordinates[0],
      }));

      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: restProps.edgePadding,
      });

      onClusterPress(cluster, children);
    };

    const renderMarker = (marker) => {
      if (marker.properties.point_count === 0) {
        const circle = propsChildren[marker.properties.index]?.props;
        if (circle?.radius) {
          return [
            propsChildren[marker.properties.index],
            <CustomCircle
              center={circle.coordinate}
              radius={circle.radius}
              fillColor={circle.fillColor}
              strokeColor={circle.strokeColor}
              key={`cluster-${marker.id}`}
            />,
          ];
        }
        return propsChildren[marker.properties.index];
      }
      return (
        <ClusterMarker
          key={`cluster-${marker.id}`}
          {...marker}
          onPress={_onClusterPress(marker)}
          clusterColor={clusterColor}
          clusterTextColor={clusterTextColor}
          clusterFontFamily={clusterFontFamily}
          tracksViewChanges={tracksViewChanges}
        />
      );
    };

    return (
      <MapView
        {...restProps}
        ref={(map) => {
          mapRef.current = map;
          if (ref) ref.current = map;
          restProps.mapRef(map);
        }}
        onRegionChangeComplete={_onRegionChangeComplete}
      >
        {markers.map((marker) => {
          return renderMarker(marker);
        })}
      </MapView>
    );
  }
);

ClusteredMapView.defaultProps = {
  clusteringEnabled: true,
  animationEnabled: true,
  preserveClusterPressBehavior: false,
  layoutAnimationConf: LayoutAnimation.Presets.spring,
  tracksViewChanges: false,
  // SuperCluster parameters
  radius: Dimensions.get("window").width * 0.06,
  maxZoom: 20,
  minZoom: 1,
  minPoints: 3,
  extent: 512,
  nodeSize: 64,
  // Map parameters
  edgePadding: { top: 50, left: 50, right: 50, bottom: 50 },
  // Cluster styles
  clusterColor: "#00B386",
  clusterTextColor: "#FFFFFF",
  // Callbacks
  onRegionChangeComplete: () => {},
  onClusterPress: () => {},
  onMarkersChange: () => {},
  superClusterRef: {},
  mapRef: () => {},
};

export default memo(ClusteredMapView);
