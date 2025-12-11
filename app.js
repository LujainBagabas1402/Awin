
// 1) إنشاء الخريطة
const map = L.map('map').setView([21.4225, 39.8262], 11); // تقريباً مكة

// 2) طبقة الخريطة
// أثناء التطوير (إنترنت):
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap'
}).addTo(map);

// في بيئة بدون إنترنت لاحقاً:
// L.tileLayer('tiles/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);

// 🔹 أيقونة الدوريات (ماركر عادي وواضح)
const patrolIcon = L.icon({
    iconUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [0, -41]
});

const patrolMarkers = {};   // لتخزين الماركر لكل دورية
const patrolCircles = {};   // لتخزين دائرة النطاق لكل دورية
const patrolAlertCircles = {}; // دوائر التنبيه الحمراء لو خرجت من النطاق (جديد)
const patrolOutOfRange = {};   // هل الدورية حالياً خارج النطاق أم لا

const predictionLayers = {};   // لتخزين خط + ماركر التوقع لكل دورية
const predictionAlerts = {};   // هل أرسلنا تنبيه AI لهذه الدورية؟





// أيقونة سيارة للدوريات
const patrolCarIcon = L.icon({
    iconUrl: 'images/car.png',
    iconSize: [38, 38],      // حجم الأيقونة
    iconAnchor: [19, 38],    // نقطة الارتكاز
    popupAnchor: [0, -38]    // مكان البوب أب
});




function loadPatrols() {
    fetch('/api/patrols/last')
        .then(r => r.json())
        .then(data => {

            const seen = new Set();  // الدوريات اللي رجعت في هذا التحديث

            //  تجهيز قائمة الفرق في الجانب
            const list = document.getElementById('patrol-list');
            if (list) {
                list.innerHTML = '';   // نمسح القديم كل مرة
            }



            data.forEach(p => {
                // قراءة الحقول من الـ API
                //   هنا يقرا كل دورية 

                const id = p.unitId || p.UnitId;
                const lat = p.lat ?? p.Lat;
                const lng = p.lng ?? p.Lng;
                const name = p.name || p.Name || `دورية ${ id }`;
                const status = (p.status || p.Status || '').trim();

                if (id == null || lat == null || lng == null) return; // احتياط

                const latLng = [lat, lng];
                seen.add(id);

                // 1) الماركر (أيقونة السيارة)
                if (!patrolMarkers[id]) {
                    patrolMarkers[id] = L.marker(latLng, { icon: patrolCarIcon })
                        .addTo(map)
                        .bindPopup(name);
                } else {
                    patrolMarkers[id].setLatLng(latLng);
                }

                // بعد تحريك / إنشاء ماركر الدورية
                drawPrediction(id, latLng);


                // 2) بيانات النطاق من جدول Units
                const fromLat = p.fromLat ?? p.FromLat;
                const toLat = p.toLat ?? p.ToLat;
                const fromLng = p.fromLng ?? p.FromLng;
                const toLng = p.toLng ?? p.ToLng;

                // 2-أ) دائرة النطاق الخضراء (للـ "متاحة" فقط إذا كانت البيانات موجودة)
                if (
                    status === 'متاحة' &&
                    fromLat != null && toLat != null &&
                    fromLng != null && toLng != null
                ) {
                    const centerLat = (fromLat + toLat) / 2.0;
                    const centerLng = (fromLng + toLng) / 2.0;
                    const radiusMeters = 1000; // غيّريه لو حبيتي

                    // هنا مكان تنرسم الدائرة الخضراء

                    if (!patrolCircles[id]) {
                        patrolCircles[id] = L.circle([centerLat, centerLng], {
                            radius: radiusMeters,
                            color: 'green',
                            fillColor: 'green',
                            fillOpacity: 0.15
                        })
                            .addTo(map)
                            // 👉 يظهر رقم الفرقة عند تمرير الماوس على النطاق
                            .bindTooltip(`  نطاق الفرقـــة : ${ id }`, {
                                direction: 'top',
                                sticky: true
                            });
                    } else {
                        patrolCircles[id].setLatLng([centerLat, centerLng]);
                        patrolCircles[id].setRadius(radiusMeters);
                    }
                } else {
                    // لو ما هي متاحة أو ما في نطاق معرف
                    if (patrolCircles[id]) {
                        map.removeLayer(patrolCircles[id]);
                        delete patrolCircles[id];
                    }
                }

                // 3) فحص هل موقع الدورية داخل نطاقها أم لا
                // 3) فحص هل موقع الدورية داخل الدائرة الخضراء أم لا
                let inRange = true;

                // إذا كان عندنا دائرة نطاق مرسومة لهذي الدورية
                if (patrolCircles[id]) {
                    const center = patrolCircles[id].getLatLng();  // مركز الدائرة
                    const radius = patrolCircles[id].getRadius();  // نصف القطر بالمتر
                    const pos = L.latLng(lat, lng);

                    // نحسب المسافة بين مركز الدائرة وموقع الدورية
                    const dist = map.distance(center, pos); // بالمتر

                    inRange = dist <= radius;
                }



                // 4) دائرة حمراء + تنبيه لو كانت خارج النطاق
                if (!inRange) {
                    // دائرة حمراء حول موقع الدورية
                    if (!patrolAlertCircles[id]) {
                        patrolAlertCircles[id] = L.circle([lat, lng], {
                            radius: 300,
                            color: 'red',
                            fillColor: 'red',
                            fillOpacity: 0.3
                        }).addTo(map);
                    } else {
                        patrolAlertCircles[id].setLatLng([lat, lng]);
                    }

                    // أول مرة تخرج فيها من النطاق نضيف تنبيه في القائمة
                    if (!patrolOutOfRange[id]) {
                        patrolOutOfRange[id] = true;
                        addAlert(`تنبيه: الفرقة ${id} خرجت من نطاقها الجغرافي.`);
                    }
                } else {
                    // رجعت داخل النطاق: نشيل الدائرة الحمراء ونصفر الحالة
                    if (patrolAlertCircles[id]) {
                        map.removeLayer(patrolAlertCircles[id]);
                        delete patrolAlertCircles[id];
                    }
                    patrolOutOfRange[id] = false;
                }


                // 📝 إضافة عنصر في قائمة الفرق
                // ==============================
                if (list) {
                    const li = document.createElement('li');
                    li.textContent = `${id} - ${name}`;
                    li.style.cursor = 'pointer';

                    li.onclick = () => {
                        // نروح لمكان الفرقة في الخريطة ونفتح الـ popup
                        map.setView(latLng, 15);
                        if (patrolMarkers[id]) {
                            patrolMarkers[id].openPopup();
                        }
                    };

                    list.appendChild(li);
                }





            });

            // 5) تنظيف الدوريات اللي ما رجعت في هذا التحديث
            Object.keys(patrolMarkers).forEach(key => {
                const id = parseInt(key, 10);
                if (!seen.has(id)) {
                    map.removeLayer(patrolMarkers[key]);
                    delete patrolMarkers[key];

                    if (patrolCircles[key]) {
                        map.removeLayer(patrolCircles[key]);
                        delete patrolCircles[key];
                    }

                    if (patrolAlertCircles[key]) {
                        map.removeLayer(patrolAlertCircles[key]);
                        delete patrolAlertCircles[key];
                    }
                }
            });

        })
        .catch(err => console.error('Error loading patrols', err));
}

// أول تحميل
loadPatrols();

// تحديث كل 5 ثواني
setInterval(loadPatrols, 5000);

let incidentMarkers = {};
let unitMarkers = {};
let unitCircles = {};

// أيقونات بسيطة للمهمات
const incidentIcon = L.icon({
    iconUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png',
    iconSize: [22, 36],
    iconAnchor: [11, 36]
});

function unitIcon(status) {
    let color;
    if (status === 'على مهمة') color = 'blue';
    else if (status === 'متاحة') color = 'green';
    else color = 'gray';

    // نستخدم دائرة بسيطة بدال أيقونة صورة، كحل سريع
    return L.divIcon({
        className: 'unit-icon',
        html: `<div style="
            width:16px;height:16px;border-radius:50%;
            background:${color};border:2px solid #fff;"></div>`
    });
}

// رسم المهمات
function renderIncidents() {
    // مسح القديم
    Object.values(incidentMarkers).forEach(m => map.removeLayer(m));
    incidentMarkers = {};

    const list = document.getElementById('incident-list');
    if (list) list.innerHTML = '';

    if (!window.incidents) return; // لو ما في بيانات تجريبية

    incidents.forEach(inc => {
        const m = L.marker([inc.lat, inc.lon], { icon: incidentIcon })
            .addTo(map)
            .bindPopup(`مهمة رقم: ${ inc.id } < br > الحالة: ${ inc.status }`);
        incidentMarkers[inc.id] = m;

        if (list) {
            const li = document.createElement('li');
            li.textContent = `${ inc.id } - ${ inc.status }`;
            li.onclick = () => {
                map.setView([inc.lat, inc.lon], 14);
                m.openPopup();
            };
            list.appendChild(li);
        }
    });
}

// رسم الفرق + النطاق
function renderUnits() {
    Object.values(unitMarkers).forEach(m => map.removeLayer(m));
    Object.values(unitCircles).forEach(c => map.removeLayer(c));
    unitMarkers = {};
    unitCircles = {};

    const list = document.getElementById('unit-list');
    if (list) list.innerHTML = '';

    if (!window.units) return; // لو ما في بيانات تجريبية

    units.forEach(u => {
        const marker = L.marker([u.lat, u.lon], { icon: unitIcon(u.status) })
            .addTo(map)
            .bindPopup(`فرقة: ${ u.id } < br > الحالة: ${ u.status }`);
        unitMarkers[u.id] = marker;

        const circle = L.circle([u.lat, u.lon], {
            radius: u.radius || 800,
            color: 'lime',
            fillColor: 'rgba(0,255,0,0.1)',
            fillOpacity: 0.2
        }).addTo(map);
        unitCircles[u.id] = circle;

        if (list) {
            const li = document.createElement('li');
            li.textContent = `${ u.id } - ${ u.status }`;
            li.onclick = () => {
                map.setView([u.lat, u.lon], 14);
                marker.openPopup();
            };
            list.appendChild(li);
        }
    });
}

renderIncidents();
renderUnits();

//function addAlert(text) {
//    const list = document.getElementById('alert-list');
//    if (!list) return;

//    const li = document.createElement('li');
//    li.textContent = text;
//    list.prepend(li);
//}

function addAlert(text, type = 'normal') {
    const list = document.getElementById('alert-list');
    const li = document.createElement('li');

    if (type === 'ai') {
        li.innerHTML = `🤖 <strong>${text}</strong>`;
    } else {
        li.textContent = text;
    }

    list.prepend(li);
}


// مثال تنبيه تجريبي:
//addAlert('تنبيه: الفرقة A-01 اقتربت من خارج نطاقها الجغرافي.');
//addAlert('تنبيه: رصد مركبة مطلوبة عبر كاميرات ساهر في حي النزهة.');

//fetch("api.json")
//    .then(res => res.json())
//    .then(data => {
//        console.log(data);
//    });

function addIncidentToMap(incident) {
    L.marker([incident.lat, incident.lng], { icon: incidentIcon })
        .addTo(map)
        .bindPopup(`مهمة رقم: ${ incident.id }`);
}

function addUnitToMap(unit) {
    L.circle([unit.lat, unit.lng], {
        radius: 200,
        color: "green"
    }).addTo(map);

    L.marker([unit.lat, unit.lng], { icon: unitIcon(unit.status) })
        .addTo(map)
        .bindPopup(`فرقة: ${ unit.id }`);
}

// 🔮 دالة حساب التوقع ورسمه على الخريطة

// 🔮 دالة حساب التوقع ورسمه على الخريطة + تنبيه AI إن اقترب من الخروج عن النطاق
async function drawPrediction(unitId, currentLatLng) {
    try {
        const res = await fetch(`/api/patrols/history/${unitId}`);
        if (!res.ok) {
            console.warn('prediction: bad response for unit', unitId);
            return;
        }

        const history = await res.json();

        // نحتاج على الأقل نقطتين للحركة
        if (!history || history.length < 2) return;

        const p1 = history[0]; // أحدث نقطة
        const p2 = history[1]; // اللي قبلها

        const latDiff = p1.lat - p2.lat;
        const lngDiff = p1.lng - p2.lng;

        // عامل بسيط للتوقع (كل ما كبّرتيه زاد البعد الزمني)
        const factor = 20; // تقريباً "دقائق قليلة" للأمام

        const predLat = p1.lat + latDiff * factor;
        const predLng = p1.lng + lngDiff * factor;

        const predLatLng = [predLat, predLng];

        // لو عندنا توقع قديم للدورية نفسها نحذفه
        if (predictionLayers[unitId]) {
            const { line, marker } = predictionLayers[unitId];
            map.removeLayer(line);
            map.removeLayer(marker);
        }

        // ====== 1) نحدد اللون الافتراضي للتوقع ======
        let lineColor = 'yellow';

        // ====== 2) نفحص: هل النقطة المتوقعة خارج نطاق الدائرة الخضراء؟ ======
        let willExitRange = false;

        if (patrolCircles[unitId]) {
            const center = patrolCircles[unitId].getLatLng();
            const radius = patrolCircles[unitId].getRadius();
            const predPos = L.latLng(predLat, predLng);

            const dist = map.distance(center, predPos); // بالمتر

            if (dist > radius) {
                willExitRange = true;
                lineColor = 'red'; // لو التوقع خارج النطاق نخلي الخط أحمر
            }
        }

        // ====== 3) رسم خط منقّط من موقعها الحالي للموقع المتوقع ======
        const line = L.polyline([currentLatLng, predLatLng], {
            color: lineColor,
            dashArray: '5, 5'
        }).addTo(map);

        // ====== 4) ماركر صغير للموقع المتوقع ======
        const marker = L.marker(predLatLng, {
            icon: L.divIcon({
                className: 'prediction-icon',
                html: '>'
            })
        })
            .addTo(map)
            .bindTooltip(`توقع AI لموقع الفرقة ${unitId}`, {
                direction: 'top',
                sticky: true
            });

        predictionLayers[unitId] = { line, marker };

        // ====== 5) لو التوقع خارج النطاق ولم نرسل تنبيه من قبل → نرسل تنبيه AI ======
        if (willExitRange) {
            if (!predictionAlerts[unitId]) {
                predictionAlerts[unitId] = true;

                // 👇 استخدمنا نفس دالة التنبيهات اللي عندك
                addAlert(`تنبيه AI: الفرقة ${unitId} في مسار قد يخرجها عن نطاقها خلال الدقائق القادمة.`);
            }
        } else {
            // لو رجع التوقع داخل النطاق نسمح بتنبيه جديد لاحقاً
            predictionAlerts[unitId] = false;
        }

    } catch (err) {
        console.error('prediction error for unit', unitId, err);
    }
}







// لو عندك دالة loadData في ملف آخر، هذا التايمر يشغّلها
setInterval(loadPatrols, 10000);