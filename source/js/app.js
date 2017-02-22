const projectDisplay = (function () {

  const TAB_IDS = [
    '#show-all',
    '#show-full-stack',
    '#show-front-end',
    '#show-back-end'
  ]

  const PROJECT_TYPE_CLASSES = [
    '.full-stack',
    '.front-end',
    '.back-end'
  ]

  const buttonHandlers = {
    showAll () {
      $('#show-all')
        .on('click', () => display.all())
    },
    showFullStack () {
      $('#show-full-stack')
        .on('click', () => display.fullStack())
    },
    showFrontEnd () {
      $('#show-front-end')
        .on('click', () => display.frontEnd())
    },
    showBackEnd () {
      $('#show-back-end')
        .on('click', () => display.backEnd());
    }
  }

/**
 * Adds an 'active' class to active tab, and removes the 'active' class
 * from inactive tabs
 */
  const setActiveTab = (activeId) => {
    TAB_IDS.map((id) => {
      if (id === activeId) {
        $(id).addClass('active')
      } else {
        $(id).removeClass('active')
      }
    })
  }
/**
 * Shows a project section based on the section's class given as the activeProject param.
 * Project section classes that don't match the class given as activeProject get hidden.
 * If no parameter is offered, show all project sections.
 *
 * @param {string} activeProject - The HTML class of project type to show.
 * 
 */
  const showProjectSections = (activeProject) => {
    let projectTypeToShow = PROJECT_TYPE_CLASSES.filter((projectType) => {
      return activeProject === projectType
    })
    projectTypeToShow = projectTypeToShow[0]
    if (!projectTypeToShow) {
      return PROJECT_TYPE_CLASSES.map((projectType) => {
        $(projectType).show()
      })
    }
    $(projectTypeToShow).show()
    PROJECT_TYPE_CLASSES.map((projectType) => {
      if (projectType !== projectTypeToShow) {
        $(projectType).hide()
      }
    })
  }

  const display = {
    all () {
      showProjectSections()
      setActiveTab('#show-all')
    },

    frontEnd () {
      showProjectSections('.front-end')
      setActiveTab('#show-front-end')      
    },

    backEnd () {
      showProjectSections('.back-end')
      setActiveTab('#show-back-end')
    },

    fullStack () {
      showProjectSections('.full-stack')
      setActiveTab('#show-full-stack')
    }
  }

  function init() {
    buttonHandlers.showAll()
    buttonHandlers.showFullStack()
    buttonHandlers.showFrontEnd()
    buttonHandlers.showBackEnd()

  }

  return {
    init
  }

})()

$(document).ready( () => {
  projectDisplay.init()
})
