const projectDisplay = (function () {

    const buttonHandlers = {
        showAll: function() {
            $('#show-all')
                .on('click', () => {
                    display.all();
                });
        },

        showFrontEnd: function() {
            $('#show-front-end')
                .on('click', () => {
                    display.frontEnd();
                });
        },

        showBackEnd: function() {
            $('#show-back-end')
                .on('click', () => {
                    display.backEnd();
                });
        }
    };

    const display = {
        all: function() {
            $('.front-end').show();
            $('.back-end').show();

            $('#show-all').addClass('active');
            $('#show-front-end').removeClass('active');
            $('#show-back-end').removeClass('active');
        },

        frontEnd: function() {
            $('.front-end').show();
            $('.back-end').hide();

            $('#show-all').removeClass('active');
            $('#show-front-end').addClass('active');
            $('#show-back-end').removeClass('active');
        },

        backEnd: function() {
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
        init
    };

})();

$(document).ready( () => {
    projectDisplay.init();
});