import React, { useEffect, useState } from 'react';

function Visual() {
    const [data, setData] = useState(null);
    const [gcData, setGcData] = useState(null);
    const [chargerData, setChargerData] = useState(null);
    const [optimalWaypoints, setOptimalWaypoints] = useState(null);
    const [optimalRoute, setOptimalRoute] = useState(null);

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
                console.log('고속도로 진입점 좌표', highwayEntryCoord);

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
                let bestWaypoint = null;
                let bestRoute = null;

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

                    if (distance < minDistance) {
                        minDistance = distance;
                        bestWaypoint = coord;
                        bestRoute = routeData;
                    }
                }

                setOptimalWaypoints(bestWaypoint);
                setOptimalRoute(bestRoute);

                console.log('고속도로 진입점 좌표:', highwayEntryCoord);
                console.log('gcData:', gcData.results[0].region.area3.name);
                console.log('chargerData:', chargerXmlDoc);
                console.log('optimalRoute:', bestRoute);

                const distanceDifference =
                    bestRoute.route.traoptimal[0].summary.distance -
                    initialData.route.traoptimal[0].summary.distance;
                console.log('거리 차이:', distanceDifference / 1000, 'km');

                const durationDifference =
                    bestRoute.route.traoptimal[0].summary.duration -
                    initialData.route.traoptimal[0].summary.duration;
                console.log(
                    '시간 차이:',
                    Math.round((durationDifference / 60000) * 10) / 10,
                    '분'
                );
            } catch (error) {
                console.error(
                    'There was a problem with the fetch operation:',
                    error
                );
            }
        };

        fetchInitialData();
    }, []);

    return (
        <div>
            <div>
                <h1>API Data</h1>
                <pre>{JSON.stringify(optimalWaypoints, null, 2)}</pre>
            </div>
        </div>
    );
}

export default Visual;
