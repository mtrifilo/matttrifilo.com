'use strict';

/****** Angularjs ******/
var weatherApp = angular.module('weatherApp', []);

/*=====================================================

TODO : use this package https://github.com/motdotla/dotenv

 ======================================================*/


weatherApp.factory('weatherFactory', function($http, $q) {
	return {
    /******* Calls OpenWeatherMap's API, returns current weather data *******/
		getWeather: function(lat, long) {
      console.log("getWeather's geo: ", lat, long);
      return $http.get('http://api.openweathermap.org/data/2.5/weather?lat=' + lat + '&lon=' + long + '&units=imperial&APPID=f367fae0df7bd74354e50a78aebd098c')
				.then(function(weatherData) {
					if (typeof weatherData === 'object') {
						return weatherData;
					} else {
						return $q.reject(weatherData);
					}
				});
    },

    /******* Calls OpenWeatherMap's API, returns 7 day forcast *******/
    getForecast: function(lat, long) {
			return $http.get('http://api.openweathermap.org/data/2.5/forecast/daily?lat=' + lat + '&lon=' + long + '&cnt=7&units=imperial&APPID=f367fae0df7bd74354e50a78aebd098c')
				.then(function(forecastData) {
					if (typeof forecastData === 'object') {
						return forecastData;
					} else {
						return $q.reject(forecastData);
					}
				});
		},

    /******* Calls Google Map's API, returns location details based on geo coordinates *******/
    getLocationName: function(lat, long) {
      return $http.get('http://maps.googleapis.com/maps/api/geocode/json?latlng=' + lat + ',' + long)
        .then(function(locationData) {
        if (typeof locationData === 'object') {
          return locationData;
        } else {
          return $q.reject(locationData);
        }
      })
    }
	}
});

/******* TODO finish zipcode logic *******/
weatherApp.controller('zipcode', function($scope) {
    $scope.geoCheck = navigator.geolocation;
});

weatherApp.controller('weatherCtrl', function ($scope, weatherFactory, $q) {

              navigator.geolocation.getCurrentPosition(success, error);

              // if geo location data is present, call weatherPromise
              function success(position) {
                $scope.lat = position.coords.latitude,
                $scope.long = position.coords.longitude;
                	weatherPromise();
              }

              function error(error) {
                console.log("error!", error);
                          return error;
              }

	var weatherPromise = function() {
    console.log('position: ', $scope.lat, $scope.long);

		weatherFactory.getWeather($scope.lat, $scope.long)
			.then(function(data) {
				$scope.weather = data.data;
				console.log('current weather: ', $scope.weather);

        /******* WX Icons *******/
        $scope.icon = "wi-na"

        var currentID = $scope.weather.weather[0].id;

        // Thunderstorm
        if ( currentID >= 200 && currentID <= 232 ) {
          $scope.icon = 'wi-day-thunderstorm';
        }

        // Drizzle
        if ( currentID >= 300 && currentID <= 321 ) {
          $scope.icon = 'wi-day-showers';
        }

        // Rain
        if ( currentID >= 500 && currentID <= 531 ) {
          $scope.icon = 'wi-day-rain';
        }

        // Snow
        if ( currentID >= 600 && currentID <= 622 ) {
          $scope.icon = 'wi-day-snow';
        }

        // Atmosphere (fog, haze, etc.)
        if ( currentID >= 701 && currentID <= 781 ) {
          $scope.icon = 'wi-day-fog';
        }

        // Sun
        if ( currentID === 800 || currentID === 801 ) {
          $scope.icon = 'wi-day-sunny';
        }

        // Clouds
        if ( currentID >= 802 && currentID <= 804 ) {
          $scope.icon = 'wi-day-cloudy';
        }


      weatherFactory.getLocationName($scope.lat, $scope.long)
        .then(function(data) {
        $scope.location = data.data;
        console.log('current location: ', $scope.location);

        weatherFactory.getForecast($scope.lat, $scope.long)
          .then(function(data) {
          $scope.forecast = data.data;
          console.log('forecast weather: ', $scope.forecast);

        });
      });
    });
  }

});
