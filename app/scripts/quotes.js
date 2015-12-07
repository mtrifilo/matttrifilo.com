'use strict';
$(document).ready(function() {

  // Initiates the quote-box with a first quote on page load
  setTimeout(function(){
   presentQuote();
  }, 100);

  function presentQuote() {
    getRandomQuote();
    var html = template(context);
    $('.quote-box').html(html);
  }

  $('.btn').on('click', presentQuote);

  var source = $('#quotes-template').html();
  var template = Handlebars.compile(source);

  var data =  [ {
  			quote: '\"The world is changed by your example, not by your opinion.\"',
  			author: '-Paulo Coelho'
  		}, {
  			quote: '\"When you have exhaused all possibilities, remember this: you haven\'t.\"',
  			author: '-Thomas Edison'
  		}, {
  			quote: '\"Don\'t fear failure. In great attempts, it is glorious even to fail.\"',
  			author: '-Bruce Lee'
  		}, {
  			quote: '\"Don\'t waste your time chasing butterflies. Mend your garden, and the butterflies will come.\"',
  			author: '-Mario Quintana'
  		}, {
  			quote: '\"Your rights matter because you never know when you\'re going to need them.\"',
  			author: '-Edward Snowden'
  		}, {
  			quote: '\"I skate to where the puck is going to be, not where it has been.\"',
  			author: '-Wayne Gretzky'
  		}, {
  	    quote: '\"Whether you think you can or think you can\'t, you\'re right.\"',
  	    author: '-Henry Ford'
  	  }, {
        quote: '\"I firmly believe that any man\'s finest hour, the greatest fulfillment of all that he holds dear, is that moment when he has worked his heart out in a good cause and lies exhausted on the field of battle - victorious.\"',
        author: '-Vince Lombardi'
      }
  	];

  var context = {
    quotes: []
  };

  // Keeps track of last random number used to
  // prevent immediate repeats
  var number = 0;


  function getRandomQuote() {
    // clear context
    context = { quotes: [] };
    // get random number
    var random = Math.floor(Math.random() * data.length);
    // make sure random isn't the same as last time
    while (random === number) {
      random = Math.floor(Math.random() * data.length);
    };
    // rememeber what random is for next time
    number = random;

    var result = data[random];
    context.quotes.push(result);

  }

});
