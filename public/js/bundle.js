'use strict';

var projectDisplay = function () {

  var TAB_IDS = ['#show-all', '#show-full-stack', '#show-front-end', '#show-back-end'];

  var PROJECT_TYPE_CLASSES = ['.full-stack', '.front-end', '.back-end'];

  var buttonHandlers = {
    showAll: function showAll() {
      $('#show-all').on('click', function () {
        return display.all();
      });
    },
    showFullStack: function showFullStack() {
      $('#show-full-stack').on('click', function () {
        return display.fullStack();
      });
    },
    showFrontEnd: function showFrontEnd() {
      $('#show-front-end').on('click', function () {
        return display.frontEnd();
      });
    },
    showBackEnd: function showBackEnd() {
      $('#show-back-end').on('click', function () {
        return display.backEnd();
      });
    }
  };

  /**
   * Adds an 'active' class to active tab, and removes the 'active' class
   * from inactive tabs
   */
  var setActiveTab = function setActiveTab(activeId) {
    TAB_IDS.map(function (id) {
      if (id === activeId) {
        $(id).addClass('active');
      } else {
        $(id).removeClass('active');
      }
    });
  };
  /**
   * Shows a project section based on the section's class given as the activeProject param.
   * Project section classes that don't match the class given as activeProject get hidden.
   * If no parameter is offered, show all project sections.
   *
   * @param {string} activeProject - The HTML class of project type to show.
   * 
   */
  var showProjectSections = function showProjectSections(activeProject) {
    var projectTypeToShow = PROJECT_TYPE_CLASSES.filter(function (projectType) {
      return activeProject === projectType;
    });
    projectTypeToShow = projectTypeToShow[0];
    if (!projectTypeToShow) {
      return PROJECT_TYPE_CLASSES.map(function (projectType) {
        $(projectType).show();
      });
    }
    $(projectTypeToShow).show();
    PROJECT_TYPE_CLASSES.map(function (projectType) {
      if (projectType !== projectTypeToShow) {
        $(projectType).hide();
      }
    });
  };

  var display = {
    all: function all() {
      showProjectSections();
      setActiveTab('#show-all');
    },
    frontEnd: function frontEnd() {
      showProjectSections('.front-end');
      setActiveTab('#show-front-end');
    },
    backEnd: function backEnd() {
      showProjectSections('.back-end');
      setActiveTab('#show-back-end');
    },
    fullStack: function fullStack() {
      showProjectSections('.full-stack');
      setActiveTab('#show-full-stack');
    }
  };

  function init() {
    buttonHandlers.showAll();
    buttonHandlers.showFullStack();
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
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImFwcC5qcyJdLCJuYW1lcyI6WyJwcm9qZWN0RGlzcGxheSIsIlRBQl9JRFMiLCJQUk9KRUNUX1RZUEVfQ0xBU1NFUyIsImJ1dHRvbkhhbmRsZXJzIiwic2hvd0FsbCIsIiQiLCJvbiIsImRpc3BsYXkiLCJhbGwiLCJzaG93RnVsbFN0YWNrIiwiZnVsbFN0YWNrIiwic2hvd0Zyb250RW5kIiwiZnJvbnRFbmQiLCJzaG93QmFja0VuZCIsImJhY2tFbmQiLCJzZXRBY3RpdmVUYWIiLCJhY3RpdmVJZCIsIm1hcCIsImlkIiwiYWRkQ2xhc3MiLCJyZW1vdmVDbGFzcyIsInNob3dQcm9qZWN0U2VjdGlvbnMiLCJhY3RpdmVQcm9qZWN0IiwicHJvamVjdFR5cGVUb1Nob3ciLCJmaWx0ZXIiLCJwcm9qZWN0VHlwZSIsInNob3ciLCJoaWRlIiwiaW5pdCIsImRvY3VtZW50IiwicmVhZHkiXSwibWFwcGluZ3MiOiI7O0FBQUEsSUFBTUEsaUJBQWtCLFlBQVk7O0FBRWxDLE1BQU1DLFVBQVUsQ0FDZCxXQURjLEVBRWQsa0JBRmMsRUFHZCxpQkFIYyxFQUlkLGdCQUpjLENBQWhCOztBQU9BLE1BQU1DLHVCQUF1QixDQUMzQixhQUQyQixFQUUzQixZQUYyQixFQUczQixXQUgyQixDQUE3Qjs7QUFNQSxNQUFNQyxpQkFBaUI7QUFDckJDLFdBRHFCLHFCQUNWO0FBQ1RDLFFBQUUsV0FBRixFQUNHQyxFQURILENBQ00sT0FETixFQUNlO0FBQUEsZUFBTUMsUUFBUUMsR0FBUixFQUFOO0FBQUEsT0FEZjtBQUVELEtBSm9CO0FBS3JCQyxpQkFMcUIsMkJBS0o7QUFDZkosUUFBRSxrQkFBRixFQUNHQyxFQURILENBQ00sT0FETixFQUNlO0FBQUEsZUFBTUMsUUFBUUcsU0FBUixFQUFOO0FBQUEsT0FEZjtBQUVELEtBUm9CO0FBU3JCQyxnQkFUcUIsMEJBU0w7QUFDZE4sUUFBRSxpQkFBRixFQUNHQyxFQURILENBQ00sT0FETixFQUNlO0FBQUEsZUFBTUMsUUFBUUssUUFBUixFQUFOO0FBQUEsT0FEZjtBQUVELEtBWm9CO0FBYXJCQyxlQWJxQix5QkFhTjtBQUNiUixRQUFFLGdCQUFGLEVBQ0dDLEVBREgsQ0FDTSxPQUROLEVBQ2U7QUFBQSxlQUFNQyxRQUFRTyxPQUFSLEVBQU47QUFBQSxPQURmO0FBRUQ7QUFoQm9CLEdBQXZCOztBQW1CRjs7OztBQUlFLE1BQU1DLGVBQWUsU0FBZkEsWUFBZSxDQUFDQyxRQUFELEVBQWM7QUFDakNmLFlBQVFnQixHQUFSLENBQVksVUFBQ0MsRUFBRCxFQUFRO0FBQ2xCLFVBQUlBLE9BQU9GLFFBQVgsRUFBcUI7QUFDbkJYLFVBQUVhLEVBQUYsRUFBTUMsUUFBTixDQUFlLFFBQWY7QUFDRCxPQUZELE1BRU87QUFDTGQsVUFBRWEsRUFBRixFQUFNRSxXQUFOLENBQWtCLFFBQWxCO0FBQ0Q7QUFDRixLQU5EO0FBT0QsR0FSRDtBQVNGOzs7Ozs7OztBQVFFLE1BQU1DLHNCQUFzQixTQUF0QkEsbUJBQXNCLENBQUNDLGFBQUQsRUFBbUI7QUFDN0MsUUFBSUMsb0JBQW9CckIscUJBQXFCc0IsTUFBckIsQ0FBNEIsVUFBQ0MsV0FBRCxFQUFpQjtBQUNuRSxhQUFPSCxrQkFBa0JHLFdBQXpCO0FBQ0QsS0FGdUIsQ0FBeEI7QUFHQUYsd0JBQW9CQSxrQkFBa0IsQ0FBbEIsQ0FBcEI7QUFDQSxRQUFJLENBQUNBLGlCQUFMLEVBQXdCO0FBQ3RCLGFBQU9yQixxQkFBcUJlLEdBQXJCLENBQXlCLFVBQUNRLFdBQUQsRUFBaUI7QUFDL0NwQixVQUFFb0IsV0FBRixFQUFlQyxJQUFmO0FBQ0QsT0FGTSxDQUFQO0FBR0Q7QUFDRHJCLE1BQUVrQixpQkFBRixFQUFxQkcsSUFBckI7QUFDQXhCLHlCQUFxQmUsR0FBckIsQ0FBeUIsVUFBQ1EsV0FBRCxFQUFpQjtBQUN4QyxVQUFJQSxnQkFBZ0JGLGlCQUFwQixFQUF1QztBQUNyQ2xCLFVBQUVvQixXQUFGLEVBQWVFLElBQWY7QUFDRDtBQUNGLEtBSkQ7QUFLRCxHQWhCRDs7QUFrQkEsTUFBTXBCLFVBQVU7QUFDZEMsT0FEYyxpQkFDUDtBQUNMYTtBQUNBTixtQkFBYSxXQUFiO0FBQ0QsS0FKYTtBQU1kSCxZQU5jLHNCQU1GO0FBQ1ZTLDBCQUFvQixZQUFwQjtBQUNBTixtQkFBYSxpQkFBYjtBQUNELEtBVGE7QUFXZEQsV0FYYyxxQkFXSDtBQUNUTywwQkFBb0IsV0FBcEI7QUFDQU4sbUJBQWEsZ0JBQWI7QUFDRCxLQWRhO0FBZ0JkTCxhQWhCYyx1QkFnQkQ7QUFDWFcsMEJBQW9CLGFBQXBCO0FBQ0FOLG1CQUFhLGtCQUFiO0FBQ0Q7QUFuQmEsR0FBaEI7O0FBc0JBLFdBQVNhLElBQVQsR0FBZ0I7QUFDZHpCLG1CQUFlQyxPQUFmO0FBQ0FELG1CQUFlTSxhQUFmO0FBQ0FOLG1CQUFlUSxZQUFmO0FBQ0FSLG1CQUFlVSxXQUFmO0FBRUQ7O0FBRUQsU0FBTztBQUNMZTtBQURLLEdBQVA7QUFJRCxDQTNHc0IsRUFBdkI7O0FBNkdBdkIsRUFBRXdCLFFBQUYsRUFBWUMsS0FBWixDQUFtQixZQUFNO0FBQ3ZCOUIsaUJBQWU0QixJQUFmO0FBQ0QsQ0FGRCIsImZpbGUiOiJidW5kbGUuanMiLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBwcm9qZWN0RGlzcGxheSA9IChmdW5jdGlvbiAoKSB7XG5cbiAgY29uc3QgVEFCX0lEUyA9IFtcbiAgICAnI3Nob3ctYWxsJyxcbiAgICAnI3Nob3ctZnVsbC1zdGFjaycsXG4gICAgJyNzaG93LWZyb250LWVuZCcsXG4gICAgJyNzaG93LWJhY2stZW5kJ1xuICBdXG5cbiAgY29uc3QgUFJPSkVDVF9UWVBFX0NMQVNTRVMgPSBbXG4gICAgJy5mdWxsLXN0YWNrJyxcbiAgICAnLmZyb250LWVuZCcsXG4gICAgJy5iYWNrLWVuZCdcbiAgXVxuXG4gIGNvbnN0IGJ1dHRvbkhhbmRsZXJzID0ge1xuICAgIHNob3dBbGwgKCkge1xuICAgICAgJCgnI3Nob3ctYWxsJylcbiAgICAgICAgLm9uKCdjbGljaycsICgpID0+IGRpc3BsYXkuYWxsKCkpXG4gICAgfSxcbiAgICBzaG93RnVsbFN0YWNrICgpIHtcbiAgICAgICQoJyNzaG93LWZ1bGwtc3RhY2snKVxuICAgICAgICAub24oJ2NsaWNrJywgKCkgPT4gZGlzcGxheS5mdWxsU3RhY2soKSlcbiAgICB9LFxuICAgIHNob3dGcm9udEVuZCAoKSB7XG4gICAgICAkKCcjc2hvdy1mcm9udC1lbmQnKVxuICAgICAgICAub24oJ2NsaWNrJywgKCkgPT4gZGlzcGxheS5mcm9udEVuZCgpKVxuICAgIH0sXG4gICAgc2hvd0JhY2tFbmQgKCkge1xuICAgICAgJCgnI3Nob3ctYmFjay1lbmQnKVxuICAgICAgICAub24oJ2NsaWNrJywgKCkgPT4gZGlzcGxheS5iYWNrRW5kKCkpO1xuICAgIH1cbiAgfVxuXG4vKipcbiAqIEFkZHMgYW4gJ2FjdGl2ZScgY2xhc3MgdG8gYWN0aXZlIHRhYiwgYW5kIHJlbW92ZXMgdGhlICdhY3RpdmUnIGNsYXNzXG4gKiBmcm9tIGluYWN0aXZlIHRhYnNcbiAqL1xuICBjb25zdCBzZXRBY3RpdmVUYWIgPSAoYWN0aXZlSWQpID0+IHtcbiAgICBUQUJfSURTLm1hcCgoaWQpID0+IHtcbiAgICAgIGlmIChpZCA9PT0gYWN0aXZlSWQpIHtcbiAgICAgICAgJChpZCkuYWRkQ2xhc3MoJ2FjdGl2ZScpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICAkKGlkKS5yZW1vdmVDbGFzcygnYWN0aXZlJylcbiAgICAgIH1cbiAgICB9KVxuICB9XG4vKipcbiAqIFNob3dzIGEgcHJvamVjdCBzZWN0aW9uIGJhc2VkIG9uIHRoZSBzZWN0aW9uJ3MgY2xhc3MgZ2l2ZW4gYXMgdGhlIGFjdGl2ZVByb2plY3QgcGFyYW0uXG4gKiBQcm9qZWN0IHNlY3Rpb24gY2xhc3NlcyB0aGF0IGRvbid0IG1hdGNoIHRoZSBjbGFzcyBnaXZlbiBhcyBhY3RpdmVQcm9qZWN0IGdldCBoaWRkZW4uXG4gKiBJZiBubyBwYXJhbWV0ZXIgaXMgb2ZmZXJlZCwgc2hvdyBhbGwgcHJvamVjdCBzZWN0aW9ucy5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gYWN0aXZlUHJvamVjdCAtIFRoZSBIVE1MIGNsYXNzIG9mIHByb2plY3QgdHlwZSB0byBzaG93LlxuICogXG4gKi9cbiAgY29uc3Qgc2hvd1Byb2plY3RTZWN0aW9ucyA9IChhY3RpdmVQcm9qZWN0KSA9PiB7XG4gICAgbGV0IHByb2plY3RUeXBlVG9TaG93ID0gUFJPSkVDVF9UWVBFX0NMQVNTRVMuZmlsdGVyKChwcm9qZWN0VHlwZSkgPT4ge1xuICAgICAgcmV0dXJuIGFjdGl2ZVByb2plY3QgPT09IHByb2plY3RUeXBlXG4gICAgfSlcbiAgICBwcm9qZWN0VHlwZVRvU2hvdyA9IHByb2plY3RUeXBlVG9TaG93WzBdXG4gICAgaWYgKCFwcm9qZWN0VHlwZVRvU2hvdykge1xuICAgICAgcmV0dXJuIFBST0pFQ1RfVFlQRV9DTEFTU0VTLm1hcCgocHJvamVjdFR5cGUpID0+IHtcbiAgICAgICAgJChwcm9qZWN0VHlwZSkuc2hvdygpXG4gICAgICB9KVxuICAgIH1cbiAgICAkKHByb2plY3RUeXBlVG9TaG93KS5zaG93KClcbiAgICBQUk9KRUNUX1RZUEVfQ0xBU1NFUy5tYXAoKHByb2plY3RUeXBlKSA9PiB7XG4gICAgICBpZiAocHJvamVjdFR5cGUgIT09IHByb2plY3RUeXBlVG9TaG93KSB7XG4gICAgICAgICQocHJvamVjdFR5cGUpLmhpZGUoKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBjb25zdCBkaXNwbGF5ID0ge1xuICAgIGFsbCAoKSB7XG4gICAgICBzaG93UHJvamVjdFNlY3Rpb25zKClcbiAgICAgIHNldEFjdGl2ZVRhYignI3Nob3ctYWxsJylcbiAgICB9LFxuXG4gICAgZnJvbnRFbmQgKCkge1xuICAgICAgc2hvd1Byb2plY3RTZWN0aW9ucygnLmZyb250LWVuZCcpXG4gICAgICBzZXRBY3RpdmVUYWIoJyNzaG93LWZyb250LWVuZCcpICAgICAgXG4gICAgfSxcblxuICAgIGJhY2tFbmQgKCkge1xuICAgICAgc2hvd1Byb2plY3RTZWN0aW9ucygnLmJhY2stZW5kJylcbiAgICAgIHNldEFjdGl2ZVRhYignI3Nob3ctYmFjay1lbmQnKVxuICAgIH0sXG5cbiAgICBmdWxsU3RhY2sgKCkge1xuICAgICAgc2hvd1Byb2plY3RTZWN0aW9ucygnLmZ1bGwtc3RhY2snKVxuICAgICAgc2V0QWN0aXZlVGFiKCcjc2hvdy1mdWxsLXN0YWNrJylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBpbml0KCkge1xuICAgIGJ1dHRvbkhhbmRsZXJzLnNob3dBbGwoKVxuICAgIGJ1dHRvbkhhbmRsZXJzLnNob3dGdWxsU3RhY2soKVxuICAgIGJ1dHRvbkhhbmRsZXJzLnNob3dGcm9udEVuZCgpXG4gICAgYnV0dG9uSGFuZGxlcnMuc2hvd0JhY2tFbmQoKVxuXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGluaXRcbiAgfVxuXG59KSgpXG5cbiQoZG9jdW1lbnQpLnJlYWR5KCAoKSA9PiB7XG4gIHByb2plY3REaXNwbGF5LmluaXQoKVxufSlcbiJdfQ==
