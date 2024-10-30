jQuery(function ($) {
	var reactions = null;

	function createCookie( name, value, days ) {
		var expires = "";

		if ( days ) {
			var date = new Date();
			date.setTime( date.getTime() + ( days * 24 * 60 * 60 * 1000 ) );
			expires = "; expires=" + date.toGMTString();
		}
		document.cookie = name + "=" + value + expires + "; path=/";
	}

	function readCookie( name ) {
		var nameEQ = name + "=";
		var ca = document.cookie.split( ';' );
		for(var i = 0; i < ca.length; i++ ) {
			var c = ca[i];
			while ( c.charAt( 0 ) == ' ' ) {
				c = c.substring( 1, c.length );
			}
			if ( c.indexOf( nameEQ ) === 0 ) {
				return c.substring( nameEQ.length, c.length );
			}
		}
		return null;
	}

	/**
	 * Read user reactions from cookie and decode it.
	 */
	function get_user_reactions() {
		if ( reactions ) {
			return reactions;
		}

		var user_reactions = {};
		var cookie_reactions = readCookie( 'creactions' );
		if ( null === cookie_reactions ) {
			return {};
		}

		var all = cookie_reactions.split( ',' );

		for ( var i = 0; i < all.length; i++ ) {
			var reactions_for_comment = all[ i ];
			if ( reactions_for_comment.length ) {
				var reactions_data = reactions_for_comment.split( ':' );
				var reaction_comment_id = reactions_data[0];
				var the_reactions = reactions_data[1].split( '.' );

				if ( '' === the_reactions[0] ) {
					the_reactions = [];
				}

				user_reactions[ reaction_comment_id ] = the_reactions;
			}

		}

		reactions = user_reactions;

		return user_reactions;
	}

	/**
	 * Encodes reactions as a string to be stored in the cookie.
	 */
	function encode_reactions( reactions ) {
		var response = [];
		for ( var comment_id in reactions ) {
			if ( reactions.hasOwnProperty( comment_id ) ) {
				var reactions_for_comment = reactions[ comment_id ];

				if ( 'undefined' != typeof reactions_for_comment ) {
					response.push( comment_id + ':' + reactions_for_comment.join( '.' ) );
				}
			}
		}
		return response.join( ',' );
	}

	/**
	 * Add a user reaction to the cookie.
	 */
	function add_user_reaction( comment_id, reaction ) {

		var user_reactions = get_user_reactions();

		// If reactions for this comment already added to the cookie.
		if ( 'undefined' != typeof user_reactions[ comment_id ] ) {

			// If not already have the same reaction in the cookie, add it.
			if ( $.inArray( reaction, user_reactions[ comment_id ] ) < 0 ) {
				user_reactions[ comment_id ].push( reaction );
			}
		} else {

			// Add reaction as new.
			user_reactions[ comment_id ] = [ reaction ];
		}

		// Store it as a cookie.
		createCookie( 'creactions', encode_reactions( user_reactions ), Comment_Reactions.cookie_days );

		reactions = user_reactions;
	}

	/**
	 * Remove a user reaction from the cookie.
	 */
	function remove_user_reaction( comment_id, reaction ) {

		var user_reactions = get_user_reactions();

		if ( 'undefined' != typeof user_reactions[ comment_id ] &&
			$.inArray( reaction, user_reactions[ comment_id ] ) >= 0 ) {
			user_reactions[ comment_id ].splice( $.inArray( reaction, user_reactions[ comment_id ] ), 1 );
		}

		createCookie( 'creactions', encode_reactions( user_reactions ), Comment_Reactions.cookie_days );

		reactions = user_reactions;
	}

	/**
	 * Update UI with count.
	 */
	function update_with_count( that, amount ) {
		var old_count = parseInt( that.find( '.reactions-count .reactions-num' ).html(), 10 );
		var new_count;
		if ( amount < 0 ) {
			new_count = old_count - 1;
		} else if ( '+1' === amount ) {
			new_count = old_count + 1;
		} else {
			new_count = amount;
		}
		that.find( '.reactions-count .reactions-num' ).html( new_count );
		if ( new_count < 1 && ! that.hasClass( 'reaction-always-visible' ) ) {
			that.remove();
		}
		if ( 0 === new_count ) {
			that.find( '.reactions-count' ).hide();
		} else {
			that.find( '.reactions-count' ).show();
		}
	}

	/**
	 * Attach a click handler to all reactions.
	 */
	function attach_click_handlers_to_all() {

		$( '#reactions_all .reaction' ).click(function () {
			var that = $( this );

			var reactions = that.parents( '.reactions' );
			var existing = reactions.children( '.reaction-' + that.data( 'reaction' ) );

			// Add the reaction if not already exists
			if ( existing.length <= 0 ) {
				var clone = that.clone();

				// Set it as a last of the reactions, before the Add new reaction button.
				that.parents( '#reactions_all' ).parent().prev().after( clone );

				// Attach a click handler for the new reaction.
				clone.click( reaction_click_handler );

				existing = clone;
			}

			that.parents( '#reactions_all' ).hide();

			// Simulate a click on the new reaction.
			existing.click();
		});
	}

	/**
	 * Do all the things that need to be done when a reaction is clicked.
	 */
	function reaction_click_handler() {
		var that = $( this );

		// In the process of communicating with WordPress, do nothing.
		if ( that.hasClass( 'reacting') ) {
			return;
		}

		that.addClass( 'reacting' );

		var comment_id = that.parents( '.reactions' ).data( 'comment_id' );
		var reaction   = that.data( 'reaction' );

		// Remove a reaction: -1, add one: '+1'.
		var direction = that.hasClass( 'reacted' ) ? -1 : '+1';

		update_with_count( that, direction );

		if ( '+1' == direction ) {
			add_user_reaction( comment_id, reaction );
		} else {
			remove_user_reaction( comment_id, reaction );
		}

		jQuery.post(
			Comment_Reactions.ajax_url, {
				action:     'creaction-submit',
				comment_id: comment_id,
				reaction:   reaction,
				method:     '+1' == direction ? 'react' : 'revert',
			}, function( response ) {
				that.removeClass( 'reacting' );

				if ( response.success ) {
					update_with_count( that, response.count );
				} else {
					// revert too hasty UI update
					update_with_count( that, response.count );
				}
			}
		);

		that.toggleClass( 'reacted' );
		that.attr( 'aria-pressed', that.hasClass( 'reacted' ) ? 'true' : 'false' );
	}

	// Close all open reaction selectors
	function closeOpenReactionsSelectors( that ) {
		// Close only if one is open elsewhere.
		if ( $( '.show_all_reactions.reacted' ).length &&
			( ! that || that[0] != $( '.show_all_reactions.reacted' )[0] ) ) {
			$( '.show_all_reactions.reacted' ).removeClass( 'reaction reacted' ).attr( 'aria-pressed', 'false' );
			$( '#reactions_all' ).hide();
		}
	}

	// Close reactions selectors if esc is hit
	$( document ).keydown( function( e ) {
		// Key code of esc is 27
		if ( 27 == e.keyCode ) {
			closeOpenReactionsSelectors();
		}
	} );

	// Show all reaction button is clicked: show the reaction selector.
	$( '.reactions .show_all_reactions' ).click(function () {

		var that = $( this );

		closeOpenReactionsSelectors( that );

		var all = $( '#reactions_all' );
		var attach_handlers = false;

		// Get all reactions from a script element
		if ( all.length <= 0 ) {
			all_reactions = Comment_Reactions.all_reactions;

			// Get the underscore template
			_.templateSettings.variable = "reaction";
			var button_template = _.template( $('#reaction_template').html() );

			// Create buttons markup
			var buttons = [];
			_.each( all_reactions, function ( reaction ) {
				buttons.push( button_template( reaction ) );
			});
			var all_buttons = buttons.join( '' );

			// Wrap and create DOM
			var full_html = '<div id="reactions_all" style="display:none;z-index:99">' + all_buttons + '</div>';
			all = $( full_html );

			attach_handlers = true;
		}

		that.after( all );

		// All reactions are new to the DOM, need to add handlers.
		if ( attach_handlers ) {
			attach_click_handlers_to_all();
		}

		that.toggleClass( 'reaction reacted' );
		that.attr( 'aria-pressed', that.hasClass( 'reacted' ) ? 'true' : 'false' );
		that.attr( 'aria-expanded', that.hasClass( 'reacted' ) ? 'true' : 'false' );

		$( '#reactions_all' ).toggle();

	});

	$( '.reactions .reaction' ).click( reaction_click_handler );

	// Prepare reactions according to the cookie.
	// For each reaction test if cookie is set and set class to reflect that.
	$( '.reactions .reaction' ).each(function () {

		var reactions = get_user_reactions();

		var comment_id = $( this ).parents( '.reactions' ).data( 'comment_id' );
		var reaction   = $( this ).data( 'reaction'   );

		if ( 'undefined' != reactions[ comment_id ] &&
			$.inArray( reaction, reactions[ comment_id ] ) >= 0 ) {
			$( this ).addClass( 'reacted' );
			$( this ).attr( 'aria-pressed', "true" );
		}
	});
});