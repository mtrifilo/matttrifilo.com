'use strict';

var projectDisplay = function () {

    var buttonHandlers = {
        showAll: function showAll() {
            $('#show-all').on('click', function () {
                display.all();
            });
        },

        showFrontEnd: function showFrontEnd() {
            $('#show-front-end').on('click', function () {
                display.frontEnd();
            });
        },

        showBackEnd: function showBackEnd() {
            $('#show-back-end').on('click', function () {
                display.backEnd();
            });
        }
    };

    var display = {
        all: function all() {
            $('.front-end').show();
            $('.back-end').show();

            $('#show-all').addClass('active');
            $('#show-front-end').removeClass('active');
            $('#show-back-end').removeClass('active');
        },

        frontEnd: function frontEnd() {
            $('.front-end').show();
            $('.back-end').hide();

            $('#show-all').removeClass('active');
            $('#show-front-end').addClass('active');
            $('#show-back-end').removeClass('active');
        },

        backEnd: function backEnd() {
            $('.front-end').hide();
            $('.back-end').show();

            $('#show-all').removeClass('active');
            $('#show-front-end').removeClass('active');
            $('#show-back-end').addClass('active');
        }
    };

    function init() {
        buttonHandlers.showAll();
        buttonHandlers.showFrontEnd();
        buttonHandlers.showBackEnd();
    }

    return {
        init: init
    };
}();

$(document).ready(function () {
    projectDisplay.init();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImFwcC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLElBQU0saUJBQWtCLFlBQVk7O0FBRWhDLFFBQU0saUJBQWlCO0FBQ25CLGlCQUFTLG1CQUFXO0FBQ2hCLGNBQUUsV0FBRixFQUNLLEVBREwsQ0FDUSxPQURSLEVBQ2lCLFlBQU07QUFDZix3QkFBUSxHQUFSO0FBQ0gsYUFITDtBQUlILFNBTmtCOztBQVFuQixzQkFBYyx3QkFBVztBQUNyQixjQUFFLGlCQUFGLEVBQ0ssRUFETCxDQUNRLE9BRFIsRUFDaUIsWUFBTTtBQUNmLHdCQUFRLFFBQVI7QUFDSCxhQUhMO0FBSUgsU0Fia0I7O0FBZW5CLHFCQUFhLHVCQUFXO0FBQ3BCLGNBQUUsZ0JBQUYsRUFDSyxFQURMLENBQ1EsT0FEUixFQUNpQixZQUFNO0FBQ2Ysd0JBQVEsT0FBUjtBQUNILGFBSEw7QUFJSDtBQXBCa0IsS0FBdkI7O0FBdUJBLFFBQU0sVUFBVTtBQUNaLGFBQUssZUFBVztBQUNaLGNBQUUsWUFBRixFQUFnQixJQUFoQjtBQUNBLGNBQUUsV0FBRixFQUFlLElBQWY7O0FBRUEsY0FBRSxXQUFGLEVBQWUsUUFBZixDQUF3QixRQUF4QjtBQUNBLGNBQUUsaUJBQUYsRUFBcUIsV0FBckIsQ0FBaUMsUUFBakM7QUFDQSxjQUFFLGdCQUFGLEVBQW9CLFdBQXBCLENBQWdDLFFBQWhDO0FBQ0gsU0FSVzs7QUFVWixrQkFBVSxvQkFBVztBQUNqQixjQUFFLFlBQUYsRUFBZ0IsSUFBaEI7QUFDQSxjQUFFLFdBQUYsRUFBZSxJQUFmOztBQUVBLGNBQUUsV0FBRixFQUFlLFdBQWYsQ0FBMkIsUUFBM0I7QUFDQSxjQUFFLGlCQUFGLEVBQXFCLFFBQXJCLENBQThCLFFBQTlCO0FBQ0EsY0FBRSxnQkFBRixFQUFvQixXQUFwQixDQUFnQyxRQUFoQztBQUNILFNBakJXOztBQW1CWixpQkFBUyxtQkFBVztBQUNoQixjQUFFLFlBQUYsRUFBZ0IsSUFBaEI7QUFDQSxjQUFFLFdBQUYsRUFBZSxJQUFmOztBQUVBLGNBQUUsV0FBRixFQUFlLFdBQWYsQ0FBMkIsUUFBM0I7QUFDQSxjQUFFLGlCQUFGLEVBQXFCLFdBQXJCLENBQWlDLFFBQWpDO0FBQ0EsY0FBRSxnQkFBRixFQUFvQixRQUFwQixDQUE2QixRQUE3QjtBQUNIO0FBMUJXLEtBQWhCOztBQTZCQSxhQUFTLElBQVQsR0FBZ0I7QUFDWix1QkFBZSxPQUFmO0FBQ0EsdUJBQWUsWUFBZjtBQUNBLHVCQUFlLFdBQWY7QUFFSDs7QUFFRCxXQUFPO0FBQ0g7QUFERyxLQUFQO0FBSUgsQ0FqRXNCLEVBQXZCOztBQW1FQSxFQUFFLFFBQUYsRUFBWSxLQUFaLENBQW1CLFlBQU07QUFDckIsbUJBQWUsSUFBZjtBQUNILENBRkQiLCJmaWxlIjoiYnVuZGxlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgcHJvamVjdERpc3BsYXkgPSAoZnVuY3Rpb24gKCkge1xuXG4gICAgY29uc3QgYnV0dG9uSGFuZGxlcnMgPSB7XG4gICAgICAgIHNob3dBbGw6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgJCgnI3Nob3ctYWxsJylcbiAgICAgICAgICAgICAgICAub24oJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBkaXNwbGF5LmFsbCgpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICB9LFxuXG4gICAgICAgIHNob3dGcm9udEVuZDogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAkKCcjc2hvdy1mcm9udC1lbmQnKVxuICAgICAgICAgICAgICAgIC5vbignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGRpc3BsYXkuZnJvbnRFbmQoKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfSxcblxuICAgICAgICBzaG93QmFja0VuZDogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAkKCcjc2hvdy1iYWNrLWVuZCcpXG4gICAgICAgICAgICAgICAgLm9uKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgZGlzcGxheS5iYWNrRW5kKCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgY29uc3QgZGlzcGxheSA9IHtcbiAgICAgICAgYWxsOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICQoJy5mcm9udC1lbmQnKS5zaG93KCk7XG4gICAgICAgICAgICAkKCcuYmFjay1lbmQnKS5zaG93KCk7XG5cbiAgICAgICAgICAgICQoJyNzaG93LWFsbCcpLmFkZENsYXNzKCdhY3RpdmUnKTtcbiAgICAgICAgICAgICQoJyNzaG93LWZyb250LWVuZCcpLnJlbW92ZUNsYXNzKCdhY3RpdmUnKTtcbiAgICAgICAgICAgICQoJyNzaG93LWJhY2stZW5kJykucmVtb3ZlQ2xhc3MoJ2FjdGl2ZScpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGZyb250RW5kOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICQoJy5mcm9udC1lbmQnKS5zaG93KCk7XG4gICAgICAgICAgICAkKCcuYmFjay1lbmQnKS5oaWRlKCk7XG5cbiAgICAgICAgICAgICQoJyNzaG93LWFsbCcpLnJlbW92ZUNsYXNzKCdhY3RpdmUnKTtcbiAgICAgICAgICAgICQoJyNzaG93LWZyb250LWVuZCcpLmFkZENsYXNzKCdhY3RpdmUnKTtcbiAgICAgICAgICAgICQoJyNzaG93LWJhY2stZW5kJykucmVtb3ZlQ2xhc3MoJ2FjdGl2ZScpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGJhY2tFbmQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgJCgnLmZyb250LWVuZCcpLmhpZGUoKTtcbiAgICAgICAgICAgICQoJy5iYWNrLWVuZCcpLnNob3coKTtcblxuICAgICAgICAgICAgJCgnI3Nob3ctYWxsJykucmVtb3ZlQ2xhc3MoJ2FjdGl2ZScpO1xuICAgICAgICAgICAgJCgnI3Nob3ctZnJvbnQtZW5kJykucmVtb3ZlQ2xhc3MoJ2FjdGl2ZScpO1xuICAgICAgICAgICAgJCgnI3Nob3ctYmFjay1lbmQnKS5hZGRDbGFzcygnYWN0aXZlJyk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgZnVuY3Rpb24gaW5pdCgpIHtcbiAgICAgICAgYnV0dG9uSGFuZGxlcnMuc2hvd0FsbCgpO1xuICAgICAgICBidXR0b25IYW5kbGVycy5zaG93RnJvbnRFbmQoKTtcbiAgICAgICAgYnV0dG9uSGFuZGxlcnMuc2hvd0JhY2tFbmQoKTtcblxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIGluaXRcbiAgICB9O1xuXG59KSgpO1xuXG4kKGRvY3VtZW50KS5yZWFkeSggKCkgPT4ge1xuICAgIHByb2plY3REaXNwbGF5LmluaXQoKTtcbn0pOyJdLCJzb3VyY2VSb290IjoiL3NvdXJjZS8ifQ==
