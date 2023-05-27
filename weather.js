const autoLocateHandler = (function() {
    function sendPosition(position) {
        let queryString = `https://api.geoapify.com/v1/geocode/reverse?lat=${position.coords.latitude}&lon=${position.coords.longitude}&apiKey=3706087c4a864c66a6651839d0f78d9e`;
        fetch(queryString, {method: 'GET'})
        .then(response => response.json())
        .then(result => {
            let instance = weatherResults.getInstance();
            let tempUnit = document.getElementById('temp-unit-checkbox').checked ? "fahrenheit" : "celsius";
            let locData = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                city: result.features[0].properties.city,
                province: result.features[0].properties.province || result.features[0].properties.state,
                country: result.features[0].properties.country,
                locationTimeZone: result.features[0].properties.timezone.name,
                tempUnit: tempUnit
            }
            instance.initiateWeatherDemo(locData);
        })
        .catch(error => console.log('error', error));
    }
    function showError(err) {
        switch(err.code) {
            case error.PERMISSION_DENIED:
                alert("User denied the request for Geolocation.");
                break;
            case error.POSITION_UNAVAILABLE:
                alert("Location information is unavailable.");
                break;
            case error.TIMEOUT:
                alert("The request to get user location timed out.");
                break;
            case error.UNKNOWN_ERROR:
                alert("An unknown error occurred.");
                break;
        }
    }
    return function () {
        if(navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(sendPosition, showError);
        } else {
            alert("This browser does not support autolocation. Use search bar instead");
        }
    }
})();

// get user input search term (city name), look for matches and list matches
let locationListHandler = (function () {
    let timer = 0;
    async function getGeoData(city) {
        let queryString = `https://geocoding-api.open-meteo.com/v1/search?name=${city}`;
        let obj = await fetch(queryString);
        let data = await obj.text();
        return await [JSON.parse(data), obj.ok];
    }

    function clearList() {
        let parent = document.getElementById('search-resultbox');
        if(parent.childNodes.length > 0) {
            for(let i = parent.childNodes.length - 1; i >= 0 ; i--) {
                parent.childNodes[i].remove();
            }
        }
    }

    function listMaker(city) {
        let promise = new Promise((resolve, reject) => {
            getGeoData(city)
            .then(res => {
                res[1] ? resolve(res[0]) : reject();
            });
        });
        promise.then(
            res => {
            clearList();
            document.getElementById('loading-icon').style.display = "none";

            if(!res.hasOwnProperty("results")) {
                document.getElementById('search-resultbox').innerHTML = 
                "<li>No results found</li>";
                return undefined;
            }

            let instance = weatherResults.getInstance();
            let items = Math.min(res.results.length, 5);
            for(let i = 0; i < items; i++) {
                let location = `${res.results[i].name}${res.results[i].admin1 ? ", " + res.results[i].admin1 : ""}${res.results[i].country ? ", " + res.results[i].country : ""}`;

                let child = document.createElement('LI');
                child.innerHTML = location;
                document.getElementById('search-resultbox').appendChild(child);

                let tempUnit = document.getElementById('temp-unit-checkbox').checked ? "fahrenheit" : "celsius";

                child.addEventListener('click', () => {
                    let locData = {
                        latitude: res.results[i].latitude,
                        longitude: res.results[i].longitude,
                        city: res.results[i].name,
                        province: res.results[i].admin1,
                        country: res.results[i].country,
                        locationTimeZone: res.results[i].timezone,
                        tempUnit: tempUnit
                    }
                    instance.initiateWeatherDemo(locData);
                });
            }
        },
        () => {
            alert("Error occured while gathering data! Please try again later");
        });
    }

    return {
        invokeSearch: function(searchTerm) {
            clearTimeout(timer);
            // delay location request function to prevent multiple queries while typing
            timer = setTimeout(() => {
                listMaker(searchTerm);
            }, 1000);
        }
    }
})();

document.getElementById('search-box').addEventListener('keyup', () => {
    let searchTerm = document.getElementById('search-box').value;
    document.getElementById('loading-icon').style.display = "block";
    if(searchTerm === "") {
        document.getElementById('search-resultbox').style.display = "none";
        document.getElementById('loading-icon').style.display = "none";
    } else {
        document.getElementById('search-resultbox').style.display = "block";
        locationListHandler.invokeSearch(searchTerm);
    }
});

document.getElementById('location-btn').addEventListener('click', () => {
    autoLocateHandler();
});
window.addEventListener('click', () => {
    document.getElementById('search-resultbox').style.display = "none";
});

// request and get weather and air quality data and display the results
let weatherResults = (function () {
    let instance;
    function init() {
        async function getData(params) {
            let weatherQueryString = "https://api.open-meteo.com/v1/forecast?" +
            `latitude=${params.latitude}&longitude=${params.longitude}&current_weather=true` + 
            `&hourly=temperature_2m,relativehumidity_2m,dewpoint_2m,apparent_temperature,` +
            `surface_pressure,cloudcover,visibility,windspeed_80m,weathercode,precipitation` +
            `&daily=weathercode,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,` +
            `precipitation_sum,precipitation_hours,windspeed_10m_max,winddirection_10m_dominant` + 
            `&timezone=auto&start_date=${params.startDate}&end_date=${params.endDate}` +
            `&temperature_unit=${params.tempUnit}`;

            let aqiQueryString = "https://air-quality-api.open-meteo.com/v1/air-quality?" +
            `latitude=${params.latitude}&longitude=${params.longitude}&hourly=uv_index,us_aqi` + 
            `&start_date=${params.startDate}&end_date=${params.startDate}`;

            let weatherObj = await fetch(weatherQueryString);
            let aqiObj = await fetch(aqiQueryString);
            let weatherData = await weatherObj.text();
            let aqiData = await aqiObj.text();

            return await {
                data: {weather: JSON.parse(weatherData), aqi: JSON.parse(aqiData)},
                ok: {weather: weatherObj.ok, aqi: aqiObj.ok}
            };
        }

        // clear current forecast elements
        function clearItems() {
            let parents = [
                document.getElementById('today-details'),
                document.getElementById('hourly-container'),
                document.getElementById('daily-container')
            ];
            parents.forEach((parent) => {
                if(parent.childNodes.length > 0) {
                    let i = parent.childNodes.length - 1;
                    for(i; i >= 0 ; i--) {
                        parent.childNodes[i].remove();
                    }
                }
            });
        }

        // show today weather status
        function todayWeather(res, date) {
            let code = res.weather.current_weather.weathercode;
            let isDay;
            let sunrise = new Date(res.weather.daily.sunrise[0]);
            let sunset = new Date(res.weather.daily.sunset[0]);
            if((date > sunrise) & (date < sunset)) isDay = true;
            else isDay = false;
            let weatherState = weatherStatusDemo(code, isDay);
            
            document.getElementById('today-temp').innerHTML = 
            `${Math.round(res.weather.current_weather.temperature)}&#176`;
 
            document.getElementById('today-weather-summary').style.backgroundImage = 
            `url(pics/${weatherState[2]}.jpg)`;

            document.getElementById('today-weather-icon').style.backgroundImage = `url(icons/${weatherState[1]}.svg)`;
            document.getElementById('today-sky-status').innerHTML = weatherState[0];

            // Today weather details 
            const detailTitles = ["High/Low", "Real Feel", "Wind", "Humidity", "Dew Point",
            "Pressure", "Cloud Cover", "Visibility", "AQI", "UV Index"];
            const detailIcons = ["thermometer-half", "r-square", "wind", "moisture", "droplet",
            "arrows-collapse", "clouds", "eye", "lungs", "brightness-low"];

            let hourlyData = res.weather.hourly;
            let currentIndex = Math.floor(date.getHours())
            let todayTempSpan = res.weather.hourly.temperature_2m.slice(0, 24);
            let lowestTemp = Math.round(Math.min.apply(null, todayTempSpan));
            let highestTemp = Math.round(Math.max.apply(null, todayTempSpan));
            let detailValues = [
                `${highestTemp}&#176/${lowestTemp}&#176`,
                `${Math.round(hourlyData.apparent_temperature[currentIndex])}&#176`,
                `${res.weather.current_weather.windspeed} km/h`,
                `${hourlyData.relativehumidity_2m[currentIndex]}%`,
                `${Math.round(hourlyData.dewpoint_2m[currentIndex])}&#176`,
                `${hourlyData.surface_pressure[currentIndex]} hPa`,
                `${hourlyData.cloudcover[currentIndex]}%`,
                `${hourlyData.visibility[currentIndex] / 1000} km`,
                res.aqi.hourly.us_aqi[currentIndex],
                `${res.aqi.hourly.uv_index[currentIndex]} of 10`
            ];

            let parent = document.getElementById('today-details');
            for(let i = 0; i < 10; i++) {
                let child = document.createElement('DIV');
                child.innerHTML = 
                `<i class="bi bi-${detailIcons[i]}"></i>
                <span class="detail-title">${detailTitles[i]}</span>
                <span class="detail-value">${detailValues[i]}</span>`;

                parent.appendChild(child);
            }
        }

        // show hourly weather forecast
        function hourlyWeather(res, date) {
            let spanStart = date.getHours();
            let spanEnd = 23;
            let grandPa = document.getElementById('hourly-container');
            let hourlyData = res.weather.hourly;

            const detailTitles = ["Wind", "Humidity","Cloud Cover", 
            "Precipitation", "AQI", "UV Index"];
            const detailIcons = ["wind", "moisture", "clouds",
            "droplet-half", "lungs", "brightness-low"];

            //forecast item preview
            for(let i = spanStart; i <= spanEnd; i++) {
                let forecastDate = new Date(hourlyData.time[i]);
                let time =  forecastDate.toLocaleTimeString([], {hour: '2-digit'});
                let parent = document.createElement('DIV');

                let code = hourlyData.weathercode[i];
                let isDay;
                let sunrise = new Date(res.weather.daily.sunrise[0]);
                let sunset = new Date(res.weather.daily.sunset[0]);
                if((forecastDate > sunrise) & (forecastDate < sunset)) isDay = true;
                else isDay = false;
                let weatherState = weatherStatusDemo(code, isDay);

                parent.setAttribute('class', "forecast-element");
                parent.innerHTML = 
                `<span class="forecast-element-time">${time}</span>
                <i class="forecast-element-icon hourly-icon"></i>
                <span class="forecast-element-temp">${Math.round(hourlyData.temperature_2m[i])}&#176</span>
                <span class="forecast-element-status">${weatherState[0]}</span>
                <i class="bi bi-chevron-down forecast-element-arrow hourly-arrow"></i>
                <div class="forecast-element-detail hourly-detail"></div>`;

                grandPa.appendChild(parent);
                document.querySelectorAll(".hourly-icon")[i - spanStart].style.backgroundImage = 
                `url(icons/${weatherState[1]}.svg)`;

                //forecast item details
                let detailValues = [
                    `${hourlyData.windspeed_80m[i]} km/h`,
                    `${hourlyData.relativehumidity_2m[i]}%`,
                    `${hourlyData.cloudcover[i]}%`,
                    `${hourlyData.precipitation[i]} mm`,
                    res.aqi.hourly.us_aqi[i],
                    `${res.aqi.hourly.uv_index[i]} of 10`
                ];

                let detailsParent = document.querySelectorAll(".hourly-detail")[i - spanStart];
                for(let j = 0; j < 6; j++) {
                    let child = document.createElement('DIV');
                    child.setAttribute('class', "forecast-element-detail-item");
                    child.innerHTML = 
                    `<i class="bi bi-${detailIcons[j]} detail-icon"></i>
                    <span class="detail-title">${detailTitles[j]}</span>
                    <span class="detail-value">${detailValues[j]}</span>`;
    
                    detailsParent.appendChild(child);
                }

                // open-close details
                parent.addEventListener('click', (function() {
                    let close = true;
                    let arrow = document.querySelectorAll(".hourly-arrow")[i - spanStart];
                    let elem = document.querySelectorAll(".hourly-detail")[i - spanStart];
                    return function () {
                        if(close) {
                            parent.style.height = "150px";
                            elem.style.height = "100px";
                            arrow.style.transform = "rotate(180deg)";
                            close = false;
                        } else {
                            parent.style.height = "40px";
                            elem.style.height = "0px";
                            arrow.style.transform = "rotate(0deg)";
                            close = true;
                        }
                    }
                })());
            }
        }

        // show daily forecast
        function dailyWeather(res) {
            let grandPa = document.getElementById('daily-container');
            let dailyData = res.weather.daily;

            const detailTitles = ["Wind", "UV Index", "Percipation", "Percipation Hours", "Sunrise", "Sunset"];
            const detailIcons = ["wind", "brightness-low", "droplet-half", "clock-history", "sunrise", "sunset"];

            for(let i = 0; i < 10; i++) {
                let parent = document.createElement('DIV');
                let options = {day:"numeric", month:"short", weekday:"short"};
                let forecastDate = new Date(dailyData.time[i]);
                let demoDate = forecastDate.toLocaleDateString("en-US", options);

                let code = dailyData.weathercode[i];
                let weatherState = weatherStatusDemo(code, true);
               
                parent.setAttribute('class', "forecast-element");
                parent.innerHTML = 
                `<span class="forecast-element-time">${demoDate}</span>
                <i class="forecast-element-icon daily-icon"></i>
                <span class="forecast-element-temp">${Math.round(dailyData.temperature_2m_max[i])}&#176/${Math.round(dailyData.temperature_2m_min[i])}&#176</span>
                <span class="forecast-element-status">${weatherState[0]}</span>
                <i class="bi bi-chevron-down forecast-element-arrow daily-arrow"></i>
                <div class="forecast-element-detail daily-detail"></div>`;

                grandPa.appendChild(parent);

                document.querySelectorAll(".daily-icon")[i].style.backgroundImage = 
                `url(icons/${weatherState[1]}.svg)`;

                let detailValues = [
                    `${dailyData.windspeed_10m_max[i]} km/h`,
                    `${dailyData.uv_index_max[i]}`,
                    `${dailyData.precipitation_sum[i]} mm`,
                    `${dailyData.precipitation_hours[i]}`,
                    (new Date(dailyData.sunrise[i])).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                    (new Date(dailyData.sunset[i])).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                ];

                let detailsParent = document.querySelectorAll(".daily-detail")[i];
                for(let j = 0; j < 6; j++) {
                    let child = document.createElement('DIV');
                    child.setAttribute('class', "forecast-element-detail-item");
                    child.innerHTML = 
                    `<i class="bi bi-${detailIcons[j]} detail-icon"></i>
                    <span class="detail-title">${detailTitles[j]}</span>
                    <span class="detail-value">${detailValues[j]}</span>`;
    
                    detailsParent.appendChild(child);
                }

                // open-close details
                parent.addEventListener('click', (function() {
                    let close = true;
                    let arrow = document.querySelectorAll(".daily-arrow")[i];
                    let elem = document.querySelectorAll(".daily-detail")[i];
                    return function () {
                        if(close) {
                            parent.style.height = "150px";
                            elem.style.height = "100px";
                            arrow.style.transform = "rotate(180deg)";
                            close = false;
                        } else {
                            parent.style.height = "40px";
                            elem.style.height = "0px";
                            arrow.style.transform = "rotate(0deg)";
                            close = true;
                        }
                    }
                })());
            }
        }

        // handle active nav and section displaying
        function activeNav(tab, page) {
            let tabs = document.getElementById('navbar').childNodes;
            let pages = document.querySelectorAll('.navpage');
            tabs.forEach(elem => {
                if(elem.nodeName === "#text") return undefined;
                elem.setAttribute('class', "");
            });
            tabs[tab].setAttribute('class', "current-nav");

            pages.forEach(elem => {
                elem.style.display = "none";
                elem.style.opacity = "0";
                elem.style.transform = "translate(0, 20vh)";
            });
            pages[page].style.display = "block";
            setTimeout(() => {
                pages[page].style.opacity = "1";
                pages[page].style.transform = "translate(0, 0)";
            }, 1);
        }

        return {
            // initializing location data for requesting weather data
            initiateWeatherDemo: function (locationData) {
                document.getElementById('loading-icon').style.display = "block";

                localStorage.setItem('weatherLatestLocData', JSON.stringify(locationData));

                document.getElementById('current-location-info').innerHTML = 
                `${locationData.city}${locationData.province ? ", " + locationData.province : ""}${locationData.country ? ", " + locationData.country : ""}`;
            
                let date  = new Date(new Date().toLocaleString("en-US", 
                {timeZone: locationData.locationTimeZone})); // current date at the location
                let date2 = new Date(date.getTime() + 1000 * 60 * 60 * 24 * 10); // forecast end date
                let time = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                
                document.getElementById('today-location-details').innerHTML = 
                `${locationData.city} weather as of ${time}`;
                
                let startDate = `${date.getFullYear()}-${("0" + (date.getMonth()+1)).slice(-2)}-${("0" + date.getDate()).slice(-2)}`;
                let endDate = `${date2.getFullYear()}-${("0" + (date2.getMonth()+1)).slice(-2)}-${("0" + date2.getDate()).slice(-2)}`;
                let queryParams = locationData;
                queryParams.startDate = startDate;
                queryParams.endDate = endDate;
                
                let promise = new Promise ((resolve, reject) => {
                    getData(queryParams)
                    .then(res => {
                        res.ok.weather ? resolve(res.data) : reject();
                        weatherData = res.data.weather;
                        aqiData = res.data.aqi;
                    });
                });
                promise.then((res) => {
                    document.getElementById('loading-icon').style.display = "none";
                    document.getElementById('empty-message').style.display = 'none';
                    activeNav(1, 0);
                    clearItems();
                    todayWeather(res, date);

                    document.getElementById('navbar').childNodes[1].addEventListener('click', function() {
                        {activeNav(1, 0);};
                    });

                    document.getElementById('navbar').childNodes[3].addEventListener('click', (function() {
                        hourlyWeather(res, date);
                        return function() {activeNav(3, 1);}
                    })());

                    document.getElementById('navbar').childNodes[5].addEventListener('click', (function() {
                        dailyWeather(res);
                        return function() {activeNav(5, 2);}
                    })());
                });
            }
        };
    }

    return {
        getInstance: function () {
            if(!instance) {
                instance = init();
            }
            return instance;
        }
    };
})();

function weatherStatusDemo(code, isDay) {
    const weatherCodes = {
        "0": ["Clear", isDay?"sun-fill":"moon-stars-fill", isDay?"clear_day":"clear_night"],
        "1": ["Mainly clear", isDay?"sun-fill":"moon-stars-fill", isDay?"mainly_clear_day":"partly_cloudy_night"],
        "2": ["Partly cloudy", isDay?"cloud-sun-fill":"cloud-moon-fill", isDay?"partly_cloudy_day":"partly_cloudy_night"],
        "3": ["Cloudy", "clouds-fill", isDay?"cloudy_day":"cloudy_night"],
        "45": ["Fog", "cloud-fog2-fill", isDay?"fog_day":"fog_night"],
        "48": ["Fog", "cloud-fog2-fill", isDay?"fog_day":"fog_night"],
        "51": ["Drizzle", "cloud-drizzle", isDay?"rainy_day":"rainy_night"],
        "53": ["Moderate drizzle", "cloud-drizzle", isDay?"rainy_day":"rainy_night"],
        "55": ["Dense drizzle", "cloud-drizzle", isDay?"rainy_day":"rainy_night"],
        "56": ["Drizzle", "cloud-drizzle", isDay?"rainy_day":"rainy_night"],
        "57": ["Dense drizzle", "cloud-drizzle", isDay?"rainy_day":"rainy_night"],
        "61": ["Slight Rain", "cloud-rain", isDay?"rainy_day":"rainy_night"],
        "63": ["Moderate rain", "cloud-rain-fill", isDay?"rainy_day":"rainy_night"],
        "65": ["Heavy rain", "cloud-rain-fill", isDay?"rainy_day":"rainy_night"],
        "66": ["Rain", "cloud-rain", isDay?"rainy_day":"rainy_night"],
        "67": ["Heavy rain", "cloud-rain-fill", isDay?"rainy_day":"rainy_night"],
        "71": ["Snow", "cloud-snow", isDay?"snowy_day":"snowy_night"],
        "73": ["Moderate snow", "cloud-snow", isDay?"snowy_day":"snowy_night"],
        "75": ["Heavy snow", "cloud-snow", isDay?"snowy_day":"snowy_night"],
        "77": ["Snow grains", "cloud-snow", isDay?"snowy_day":"snowy_night"],
        "80": ["Rain shower", "cloud-rain", isDay?"rainy_day":"rainy_night"],
        "81": ["Moderate rain shower", "cloud-rain-fill", isDay?"rainy_day":"rainy_night"],
        "82": ["Heavy rain shower", "cloud-rain-fill", isDay?"rainy_day":"rainy_night"],
        "85": ["Snow shower", "cloud-snow", isDay?"snowy_day":"snowy_night"],
        "86": ["Heavy snow shower", "cloud-snow", isDay?"snowy_day":"snowy_night"],
        "95": ["Thunderstorm", "cloud-lightning-fill", isDay?"thunder_day":"thunder_night"],
        "96": ["Thunderstorm", "cloud-hail", isDay?"thunder_day":"thunder_night"],
        "99": ["Thunderstorm", "cloud-hail", isDay?"thunder_day":"thunder_night"],
    };
    return weatherCodes[code];
}

// if user has already used the app, show the latest user location onload
window.addEventListener('load', () => {
    if(localStorage.getItem('weatherLatestLocData') !== null) {
        let instance = weatherResults.getInstance();
        let locData = JSON.parse(localStorage.getItem('weatherLatestLocData'));
        instance.initiateWeatherDemo(locData);
    }
});

document.getElementById('temp-unit-container').addEventListener('click', () => {
    let instance = weatherResults.getInstance();
    let unit = document.getElementById('temp-unit-checkbox').checked ? "celsius" : "fahrenheit";
    let locData = JSON.parse(localStorage.getItem('weatherLatestLocData'));
    locData.tempUnit = unit;
    instance.initiateWeatherDemo(locData);
});