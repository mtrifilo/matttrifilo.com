'use strict';

var pomodoroApp = angular.module('pomodoroApp', []);

pomodoroApp.controller('pomodoroCtrl',
  function($scope, $interval) {

    /******* Initializing Variables =====================================================*/
      // Number of minutes to countdown from. User changeable
    $scope.initialTimerSetting = 25;
      // Amount of time to resume from after pause
    $scope.resumeTimerSetting = null;
      // Exact time of Start | Pause button press
    $scope.startTime = null;
      // The exact time of the timer's future completion, calculated from startTime plus initialTimerSetting
    $scope.endTime = null;
      // The diplayed count in the view, initiallized with initalTimerSetting's time
    $scope.resumeTime = (Date.now() + $scope.resumeTimerSetting) - Date.now();

    $scope.displayedCount = 60000 * $scope.initialTimerSetting;
      // Boolean
    $scope.timerRunning = false;

    $scope.timerPaused = false;

    $scope.resumeTimerSetting = null;



    /******* Timer Functions ============================================================*/
      // Stores the exact time of a Start | Pause button press
    $scope.getStartTime = function () {
      $scope.startTime = Date.now();
    };
      // Calculates the future time when the timer will complete based on $scope.startTime
    $scope.getEndTime = function () {
      $scope.endTime = $scope.startTime + (60000 * $scope.initialTimerSetting);
    };

    $scope.getResumeTime = function() {
      $scope.resumeTime = Date.now() + $scope.resumeTimerSetting;
    };

      // Initialize Timer
    $scope.runTimer = function () {
      $scope.promise = $interval(countdown, 100);
      function countdown() {
        $scope.displayedCount = $scope.endTime - Date.now();
        console.log('start function fired!', $scope.resumeTimerSetting, $scope.displayedCount);
        if ($scope.displayedCount < 1000) {
          $interval.cancel($scope.promise);
        }
      }
    };

      // Pause timer
    $scope.timerPause = function() {
      $scope.resumeTimerSetting = $scope.displayedCount;
      console.log('paused!', '$scope.resumeTimerSetting = ', $scope.resumeTimerSetting);
      $interval.cancel($scope.promise);
      $interval.cancel($scope.promiseResume);
    };

      // Resume timer after pause
    $scope.timerResume = function () {
      $scope.getResumeTime();
      $scope.promiseResume = $interval(resumeCountdown, 100);
      function resumeCountdown() {
        $scope.displayedCount = $scope.resumeTime - Date.now();
        if ($scope.displayedCount < 1000) {
          $interval.cancel($scope.promiseResume);
        }
      }
    };

  /******* Button handlers ================================================================*/

    /******* Start | Pause Button Handler *******/
    $scope.startPause = function () {

      // if timer is currently running, pause or resume
      if ($scope.timerRunning === true) {

        // NOT WORKING if timer is paused, resume
        if($scope.timerPaused === true) {
          $scope.timerPaused = false;

          $scope.timerResume();
        return;
        }

        // If timer is running, then pause
        $scope.timerPaused = true;
        $scope.timerPause();
        return;
      }

      $scope.timerRunning = true;

      // Calculate start and end times from the exact time of button press
      $scope.getStartTime();
      $scope.getEndTime();

      // Update the view with current time remaining until endTime is reached
      $scope.runTimer();

    /******* Reset Button Handler *******/
    $scope.reset = function () {
      $interval.cancel($scope.promise);
      $interval.cancel($scope.promiseResume);
      $scope.displayedCount = 60000 * $scope.initialTimerSetting;
      $scope.startTime = null;
      $scope.endTime = null;
      $scope.timerRunning = false;
      $scope.timerPaused = false;
    };
  };
});
