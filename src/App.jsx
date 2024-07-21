import React, { useEffect, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import {
    MapContainer,
    TileLayer,
    Polyline,
    Marker,
    Popup,
} from 'react-leaflet';
import L from 'leaflet';

function App() {
    const [data, setData] = useState(null);
    const [gcData, setGcData] = useState(null);
    const [chargerData, setChargerData] = useState(null);
    const [shortestDistanceWaypoints, setShortestDistanceWaypoints] =
        useState(null);
    const [shortestDurationWaypoints, setShortestDurationWaypoints] =
        useState(null);
    const [shortestDistanceRoute, setShortestDistanceRoute] = useState(null);
    const [shortestDurationRoute, setShortestDurationRoute] = useState(null);

    const [selectedPaths, setSelectedPaths] = useState({
        initial: false,
        distance: false,
        duration: false,
    });

    const [loading, setLoading] = useState(true); // 로딩 상태 변수

    const start = [126.818941, 37.159415];
    const goal = [127.0286427, 37.2634485];
    const option = 'traoptimal';

    const initialDirectionUrl = new URL(
        '/api/map-direction/v1/driving',
        window.location.origin
    );
    initialDirectionUrl.search = new URLSearchParams({
        start: start.join(','),
        goal: goal.join(','),
        option: option,
    }).toString();

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                // 첫 번째 API 호출
                const response = await fetch(initialDirectionUrl, {
                    headers: {
                        'X-NCP-APIGW-API-KEY-ID': '3xiok7pyhe',
                        'X-NCP-APIGW-API-KEY':
                            'hRTIMwqCOfDuO1NZfMNrfE5gYYST5swd752LAeWX',
                    },
                });
                if (!response.ok)
                    throw new Error('Network response was not ok');
                const initialData = await response.json();
                setData(initialData);

                // 고속도로 진입점 탐색
                const highwayEntryIndex =
                    initialData.route.traoptimal[0].guide.findIndex((guide) =>
                        guide.instructions.includes('고속도로 진입')
                    );
                if (highwayEntryIndex === -1)
                    throw new Error('고속도로 진입점을 찾지 못했습니다.');

                const highwayEntryCoord =
                    initialData.route.traoptimal[0].path[highwayEntryIndex - 1];

                const midPoint = [
                    (start[0] + highwayEntryCoord[0]) / 2,
                    (start[1] + highwayEntryCoord[1]) / 2,
                ];

                const reverseGeocodeUrl = new URL(
                    '/api/map-reversegeocode/v2/gc',
                    window.location.origin
                );
                reverseGeocodeUrl.search = new URLSearchParams({
                    coords: midPoint.join(','),
                    output: 'json',
                }).toString();

                // 두 번째 API 호출
                const gcResponse = await fetch(reverseGeocodeUrl, {
                    headers: {
                        'X-NCP-APIGW-API-KEY-ID': '3xiok7pyhe',
                        'X-NCP-APIGW-API-KEY':
                            'hRTIMwqCOfDuO1NZfMNrfE5gYYST5swd752LAeWX',
                    },
                });
                if (!gcResponse.ok)
                    throw new Error('Network response was not ok');
                const gcData = await gcResponse.json();
                setGcData(gcData);

                const midAddr = gcData.results[0].region.area2.name;

                const chargerUrl = new URL(
                    'charge/service/EvInfoServiceV2/getEvSearchList',
                    window.location.origin
                );
                chargerUrl.search = new URLSearchParams({
                    ServiceKey:
                        'ccCgUM30g2LMLUHE2QMEp7N7leC6dBMwZ/CoPHJHKPPDc31pbrT+rQf2qrNI3qfqeH8lIz+QAAwmdzGK96vKng==',
                    pageNo: 1,
                    numOfRows: 100,
                    addr: midAddr,
                }).toString();

                // 세 번째 API 호출
                const chargerResponse = await fetch(chargerUrl);
                if (!chargerResponse.ok)
                    throw new Error('Network response was not ok');
                const chargerText = await chargerResponse.text();
                const parser = new DOMParser();
                const chargerXmlDoc = parser.parseFromString(
                    chargerText,
                    'text/xml'
                );
                setChargerData(chargerXmlDoc);

                const extractCoordinates = (xmlDoc) => {
                    const items = xmlDoc.getElementsByTagName('item');
                    const coordinates = [];

                    for (let i = 0; i < items.length; i++) {
                        const item = items[i];
                        const chargeTp =
                            item.getElementsByTagName('chargeTp')[0]
                                ?.textContent;
                        const cpStat =
                            item.getElementsByTagName('cpStat')[0]?.textContent;
                        const lat =
                            item.getElementsByTagName('lat')[0]?.textContent;
                        const longi =
                            item.getElementsByTagName('longi')[0]?.textContent;

                        if (chargeTp === '2' && cpStat === '1') {
                            coordinates.push({ longi, lat });
                        }
                    }

                    return coordinates;
                };

                const chargeStationCoords = extractCoordinates(chargerXmlDoc);
                if (!chargeStationCoords.length) return;

                let minDistance = Number.MAX_VALUE;
                let minDuration = Number.MAX_VALUE;
                let shortestDistanceWaypoint = null;
                let shortestDistanceRoute = null;
                let shortestDurationWaypoint = null;
                let shortestDurationRoute = null;

                for (const coord of chargeStationCoords) {
                    const routeUrl = new URL(
                        '/api/map-direction/v1/driving',
                        window.location.origin
                    );
                    routeUrl.search = new URLSearchParams({
                        start: start.join(','),
                        goal: goal.join(','),
                        waypoints: `${coord.longi},${coord.lat}`,
                        option: option,
                    }).toString();

                    const routeResponse = await fetch(routeUrl, {
                        headers: {
                            'X-NCP-APIGW-API-KEY-ID': '3xiok7pyhe',
                            'X-NCP-APIGW-API-KEY':
                                'hRTIMwqCOfDuO1NZfMNrfE5gYYST5swd752LAeWX',
                        },
                    });

                    if (!routeResponse.ok)
                        throw new Error('Network response was not ok');
                    const routeData = await routeResponse.json();
                    const distance =
                        routeData.route.traoptimal[0].summary.distance;
                    const duration =
                        routeData.route.traoptimal[0].summary.duration;

                    if (distance < minDistance) {
                        minDistance = distance;
                        shortestDistanceWaypoint = coord;
                        shortestDistanceRoute = routeData;
                    }

                    if (duration < minDuration) {
                        minDuration = duration;
                        shortestDurationWaypoint = coord;
                        shortestDurationRoute = routeData;
                    }
                }

                setShortestDistanceWaypoints(shortestDistanceWaypoint);
                setShortestDistanceRoute(shortestDistanceRoute);
                setShortestDurationWaypoints(shortestDurationWaypoint);
                setShortestDurationRoute(shortestDurationRoute);

                console.log('최적 비경유 경로(json):', initialData);

                console.log('고속도로 진입점 좌표:', highwayEntryCoord);
                console.log(
                    '출발지와 고속도로 진입점의 중간지점 행정구역:',
                    gcData.results[0].region.area2.name
                );
                console.log('전기차 충전소 목록(xml):', chargerXmlDoc);
                console.log('최단거리 경유 경로(json):', shortestDistanceRoute);
                console.log('최소시간 경유 경로(json):', shortestDurationRoute);
            } catch (error) {
                console.error('Error fetching data:', error);
            } finally {
                setLoading(false); // API 호출 완료 후 로딩 상태 해제
            }
        };

        console.log('waypoint', shortestDistanceWaypoints);
        fetchInitialData();
    }, []);

    const calculateMatchPercentage = (path1, path2) => {
        const distance = (coord1, coord2) => {
            const lat1 = coord1[0],
                lon1 = coord1[1];
            const lat2 = coord2[0],
                lon2 = coord2[1];
            const R = 6371; // km
            const dLat = ((lat2 - lat1) * Math.PI) / 180;
            const dLon = ((lon2 - lon1) * Math.PI) / 180;
            const a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos((lat1 * Math.PI) / 180) *
                    Math.cos((lat2 * Math.PI) / 180) *
                    Math.sin(dLon / 2) *
                    Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c * 1000; // meters
        };

        const threshold = 50; // 50 meters
        let matchCount = 0;

        for (let i = 0; i < path1.length; i++) {
            for (let j = 0; j < path2.length; j++) {
                if (distance(path1[i], path2[j]) < threshold) {
                    matchCount++;
                    break;
                }
            }
        }

        return (matchCount / path1.length) * 100;
    };

    const initialPath = data?.route?.traoptimal[0]?.path || [];
    const setShortestDistancePath =
        shortestDistanceRoute?.route?.traoptimal[0]?.path || [];
    const shortestDurationPath =
        shortestDurationRoute?.route?.traoptimal[0]?.path || [];

    const matchPercentageInitialDistance = calculateMatchPercentage(
        initialPath,
        setShortestDistancePath
    );
    const matchPercentageInitialDuration = calculateMatchPercentage(
        initialPath,
        shortestDurationPath
    );

    const handlePathSelection = (pathKey) => {
        setSelectedPaths((prev) => ({
            ...prev,
            [pathKey]: !prev[pathKey],
        }));
    };

    if (loading) {
        return <div>Loading...</div>; // 로딩 화면 표시
    }

    return (
        <div>
            <h1>[과제테스트_이동준]</h1>
            <div>
                <button onClick={() => handlePathSelection('initial')}>
                    {selectedPaths.initial
                        ? '미경유 경로 선택 해제'
                        : '미경유 경로 선택'}
                </button>
                <button onClick={() => handlePathSelection('distance')}>
                    {selectedPaths.distance
                        ? '경유 경로(최단거리) 선택 해제'
                        : '경유 경로(최단거리) 선택'}
                </button>
                <button onClick={() => handlePathSelection('duration')}>
                    {selectedPaths.duration
                        ? '경유 경로(최소시간) 선택 해제'
                        : '경유 경로(최소시간) 선택'}
                </button>
            </div>
            <MapContainer
                center={[37.159415, 126.818941]}
                zoom={10}
                style={{ height: '500px', width: '100%' }}>
                <TileLayer
                    url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                {initialPath.length > 0 && selectedPaths.initial && (
                    <Polyline
                        positions={initialPath.map((coord) => [
                            coord[1],
                            coord[0],
                        ])}
                        color='blue'
                    />
                )}
                {setShortestDistancePath.length > 0 &&
                    selectedPaths.distance && (
                        <>
                            <Polyline
                                positions={setShortestDistancePath.map(
                                    (coord) => [coord[1], coord[0]]
                                )}
                                color='red'
                            />
                            <Marker
                                position={[
                                    shortestDistanceWaypoints.lat,
                                    shortestDistanceWaypoints.longi,
                                ]}
                                icon={L.icon({
                                    iconUrl:
                                        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
                                    iconSize: [25, 41],
                                    iconAnchor: [12, 41],
                                    popupAnchor: [1, -34],
                                })}>
                                <Popup>
                                    Charge Station
                                    <br />
                                    Latitude: {shortestDistanceWaypoints.lat}
                                    <br />
                                    Longitude: {shortestDistanceWaypoints.longi}
                                </Popup>
                            </Marker>
                        </>
                    )}
                {shortestDurationPath.length > 0 && selectedPaths.duration && (
                    <>
                        <Polyline
                            positions={shortestDurationPath.map((coord) => [
                                coord[1],
                                coord[0],
                            ])}
                            color='green'
                        />
                        <Marker
                            position={[
                                shortestDurationWaypoints.lat,
                                shortestDurationWaypoints.longi,
                            ]}
                            icon={L.icon({
                                iconUrl:
                                    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
                                iconSize: [25, 41],
                                iconAnchor: [12, 41],
                                popupAnchor: [1, -34],
                            })}>
                            <Popup>
                                Charge Station
                                <br />
                                Latitude: {shortestDurationWaypoints.lat}
                                <br />
                                Longitude: {shortestDurationWaypoints.longi}
                            </Popup>
                        </Marker>
                    </>
                )}
            </MapContainer>
            <div>
                <h2>경로 일치율</h2>
                {selectedPaths.initial && selectedPaths.distance && (
                    <p>
                        미경유 vs 경유(최단거리):{' '}
                        {matchPercentageInitialDistance.toFixed(2)}%
                    </p>
                )}
                {selectedPaths.initial && selectedPaths.duration && (
                    <p>
                        미경유 vs 경유(최소시간):{' '}
                        {matchPercentageInitialDuration.toFixed(2)}%
                    </p>
                )}
                {!selectedPaths.initial &&
                    !selectedPaths.distance &&
                    !selectedPaths.duration && <p>경로를 선택하세요.</p>}

                <h2>경로 정보</h2>
                {selectedPaths.initial && (
                    <p>
                        미경유 - 소요시간:{' '}
                        {Math.round(
                            (data?.route?.traoptimal[0]?.summary?.duration ||
                                0) / 60000
                        )}
                        분, 이동거리:{' '}
                        {(
                            (data?.route?.traoptimal[0]?.summary?.distance ||
                                0) / 1000
                        ).toFixed(1)}
                        km
                    </p>
                )}
                {selectedPaths.distance && (
                    <p>
                        경유(최단거리) - 소요시간:{' '}
                        {Math.round(
                            (shortestDistanceRoute.route.traoptimal[0].summary
                                .duration || 0) / 60000
                        )}
                        분, 이동거리:{' '}
                        {(
                            (shortestDistanceRoute.route.traoptimal[0].summary
                                .distance || 0) / 1000
                        ).toFixed(1)}
                        km
                    </p>
                )}
                {selectedPaths.duration && (
                    <p>
                        경유(최소시간) - 소요시간:{' '}
                        {Math.round(
                            (shortestDurationRoute.route.traoptimal[0].summary
                                .duration || 0) / 60000
                        )}
                        분, 이동거리:{' '}
                        {(
                            (shortestDurationRoute.route.traoptimal[0].summary
                                .distance || 0) / 1000
                        ).toFixed(1)}
                        km
                    </p>
                )}
                {!selectedPaths.initial &&
                    !selectedPaths.distance &&
                    !selectedPaths.duration && <p>경로를 선택하세요.</p>}
            </div>
        </div>
    );
}

export default App;
