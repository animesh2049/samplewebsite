var map = undefined;
var layer = undefined;
var timer = undefined;
var cachebust = undefined;
var markers = [];
var adding = false;
var resultsLayer = undefined;

$.fn.extend({
  focusAtEnd: function () {
    return this.each(function() {
      var val = $(this).val();
      $(this).focus().val('').val(val);
    });
  },

  showErrors: function (errors, success) {
    success = success || function () {};

    if ($.isEmptyObject(errors)) {
      return success();
    }

    var form = $(this);
    $.each(errors, function (k, v) {
      var input = form.find('[name=' + k + ']');

      input
        .addClass('is-invalid')
        .removeClass('is-valid')
        .siblings('.invalid-feedback')
          .remove()
        .end()
        .focusAtEnd()
        ;

      // We're inserting each new error, so reverse the list.
      $.each(v.reverse(), function () {
        var div = $('<div class="invalid-feedback"/>').html(this.message);
        input.after(div);
      });
    });

    return this;
  }
});


$.extend({
  feature: function (body_class, callback) {
    if ($('body').hasClass(body_class)) {
      $(function() {
        callback();
      });
    }
  },

  addMarker: function (lat, lng) {
    var button = $('.js-add-marker');

    if (button.length === 0) {
      return;
    }

    $.get(button.data('url'), function (html) {
      var modal = $(html);
      var form = modal.find('form');

      $('#navbar-collapse').collapse('hide');

      form.on('submit', function (e) {
        e.preventDefault();
        modal.find('.js-save-marker').click();
      });

      form.find('[name=lat]').val(lat);
      form.find('[name=lng]').val(lng);
      form.find('[name=title]').val('');
      form.find('[name=description]').val('');

      modal.modal();
      modal.on('shown.bs.modal', function (e) {
        form.find('[name=title]').focusAtEnd();
      });
      modal.on('hidden.bs.modal', function (e) {
        // Reset UI
        $.addingMode(false);
        modal.remove();
      });
    });
  },

  addingMode: function (enable) {
    var button = $('.js-add-marker');

    adding = enable;

    if (adding) {
      button.text(button.data('adding'));
      $('#mapid').css('cursor', 'crosshair');
    } else {
      button.text(button.data('default'));
      $('#mapid').css('cursor', 'grab');
    }
  },

  getIcon: function (icon) {
    return L.icon({
        iconUrl: icons[icon].url
      , iconAnchor: [12,41]
      , popupAnchor: [1,-34]
      , tooltipAnchor: [16,-28]
    });
  },

  sync: function (count) {
    count = count || 1;
    clearTimeout(timer);
    var data = xhrData
    if (!data.markers) {
      return;
    }

    // Create map if it does not exist
    if (typeof map === 'undefined') {
      // Show/hide controls first, so map size is known, etc.
      $('#mapid').removeClass('d-none');
      $('.js-progress').remove();
      $('.navbar-nav').removeClass('fade');
      
      map = L.map('mapid', {
        zoom: data.map.zoom,
        layers: [],
      });
      
      if (data.map.lat && data.map.lng) {
        map.panTo({'lat': data.map.lat, 'lng': data.map.lng});
      } else {
        map.panTo({'lat': '51.490', 'lng': '-0.120'});
        map.locate({setView: true});
      }
      
      L.control.scale().addTo(map);
      
      map.on('click', function (e) {
        // Require shift + click if not in "adding" mode.
        if (!adding && !e.originalEvent.shiftKey) {
          return;
        }
        
        $.addMarker(e.latlng.lat, e.latlng.lng);
      });
    }

    // Set/update Layer if necessary
    if (typeof layer === 'undefined' || layer.options.id != data.map.layer) {
      layer = L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}', {
      id: data.map.layer,
      maxZoom: 23,
      tileSize: 512,
      zoomOffset: -1,
      accessToken: data.mapbox_access_token,
      attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> <strong><a href="https://www.mapbox.com/map-feedback/" target="_blank">Improve this map</a></strong>'
    });

    map.eachLayer(function (x) {
      map.removeLayer(x);
    });
    layer.addTo(map);

    // Search
    resultsLayer = new L.LayerGroup().addTo(map);

    var searchControl = new L.esri.Controls.Geosearch().addTo(map);
    searchControl.on('results', function (data){
      resultsLayer.clearLayers();
      
      var icon = $.getIcon('red');
      $.each(data.results, function (k, v) {
        var marker = L.marker(v.latlng, {'icon': icon});
        
        marker.on('click', function () {
          $.addMarker(v.latlng.lat, v.latlng.lng);
          resultsLayer.clearLayers();
        });
        
        resultsLayer.addLayer(marker);
      });
    });
    }

    // Set titles
    $('.navbar-brand').html(data.map.brand);
    document.querySelector('title').innerHTML = data.map.title;

    cachebust = data.cachebust;

    // Remove all existing markers
    $.each(markers, function (k, v) {
      v.remove();
    });

    // Add/save all markers
    $.each(data.markers, function (k, v) {
      var marker = L
      .marker([v.lat, v.lng], {
        'icon': $.getIcon(v.icon)
        , 'title': v.title
      })
      .addTo(map)
      .bindPopup(v.html, {
        minWidth: 200
      })
      ;
      
      markers.push(marker);
    });

    map.closePopup();
    resultsLayer.clearLayers();     
  },
});

$.ajaxSetup({
  beforeSend: function(xhr, settings) {
    function getCookie(name) {
        var cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            var cookies = document.cookie.split(';');
            for (var i = 0; i < cookies.length; i++) {
                var cookie = jQuery.trim(cookies[i]);
                // Does this cookie string begin with the name we want?
                if (cookie.substring(0, name.length + 1) == (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    if (!(/^http:.*/.test(settings.url) || /^https:.*/.test(settings.url))) {
        // Only send the token to relative URLs i.e. locally.
        xhr.setRequestHeader("X-CSRFToken", getCookie('csrftoken'));
    }
  }
});

$.feature('f_maps_view', function () {
  $('.js-copy-to-clipboard').on('click', function (e) {
    var modal = $(this).parents('#share-modal');

    modal.find('.js-uri').select();

    document.execCommand('copy');
  });

  $('.js-edit').on('click', function (e) {
    e.preventDefault();

    var elem = $(this);

    $.get(elem.data('url'), function (html) {
      var modal = $(html);
      var form = modal.find('form');

      $('#navbar-collapse').collapse('hide');

      form.on('submit', function (e) {
        e.preventDefault();
        modal.find('.js-authenticate').click();
      });

      modal.modal();
      modal.on('shown.bs.modal', function (e) {
        form.find('[name=password]').focusAtEnd();
      });
      modal.on('hidden.bs.modal', function (e) {
        modal.remove();
      });
    });
  });

  $(document).on('click', '.js-authenticate', function (e) {
    e.preventDefault();

    var elem = $(this);
    var form = elem.parents('.modal').find('form');


    $.post(elem.data('url'), form.serialize(), function (errors) {
      form.showErrors(errors, function () {
        window.location.reload();
      });
    })
  });

  // Remove validation errors text upon changing a field
  $(document).on('cchange keyup keydown paste click', 'input', function () {
    $(this).on('change keyup paste click', function () {
      $(this).removeClass('is-invalid');
    });
  });

  // Handle ESC
  $(document).on('keydown', '.modal input, .modal textarea', function (e) {
    if (e.keyCode != 27) {
      return true;
    }

    e.preventDefault();

    $(this).parents('.modal').modal().hide();
  });
});

$.feature('f_maps_edit', function () {
  $('.js-settings').on('click', function (e) {
    e.preventDefault();

    var elem = $(this);

    $.get(elem.data('url'), function (html) {
      var modal = $(html);
      var form = modal.find('form');

      modal.modal();
      modal.on('shown.bs.modal', function (e) {
        form.find('[name=title]').focusAtEnd();

        form.on('submit', function (e) {
          e.preventDefault();
          modal.find('.js-save-settings').click();
        });
      });
      modal.on('hidden.bs.modal', function (e) {
        modal.remove();
      });
    });
  });

  $(document).on('click', '.js-password', function (e) {
    e.preventDefault();

    var elem = $(this);

    $.get(elem.data('url'), function (html) {
      var modal = $(html);
      var form = modal.find('form');

      modal.modal();
      modal.on('shown.bs.modal', function (e) {
        form.on('submit', function (e) {
          e.preventDefault();
          modal.find('.js-set-password').click();
        });
      });
      modal.on('hidden.bs.modal', function (e) {
        modal.remove();
      });
    });
  });

  $('.js-add-marker').on('click', function (e) {
    e.preventDefault();

    $.addingMode(true);
  });

  $(document).on('click', '.js-save-marker, .js-save-settings, .js-set-password', function (e) {
    e.preventDefault();

    var elem = $(this);
    var modal = elem.parents('.modal');
    var form = modal.find('form');

    elem.text(elem.data('saving'));

    $.post(elem.data('url'), form.serialize(), function (errors) {
      elem.text(elem.data('original'));

      form.showErrors(errors, function () {
        modal.modal('hide');
        $.sync();
      });
    });
  });

  $('#mapid').on('click', '.js-edit-marker', function (e) {
    e.preventDefault();

    var elem = $(this);

    $.get(elem.data('url'), function (html) {
      var modal = $(html);
      var form = modal.find('form');

      modal.modal();
      modal.on('shown.bs.modal', function (e) {
        form.find('[name=title]').focusAtEnd();

        form.on('submit', function (e) {
          e.preventDefault();
          modal.find('.js-save-marker').click();
        });
      });
      modal.on('hidden.bs.modal', function (e) {
        modal.remove();
      });
    });
  });

  $(document).on('click', '.js-delete-marker', function (e) {
    e.preventDefault();

    var elem = $(this);
    var modal = elem.parents('.modal');

    if (confirm(elem.data('confirm'))) {
      $.post(elem.data('url'), function () {
        modal.modal('hide');
        $.sync();
      });
    }
  });

  $('.js-search').on('click', function (e) {
    e.preventDefault();

    $('.geocoder-control.leaflet-control').click()
  });

  $('.js-save-center').on('click', function (e) {
      e.preventDefault();

      var elem = $(this);

      elem.text(elem.data('saving'));

      $.post(elem.data('url'), {
          'lat': map.getCenter().lat
        , 'lng': map.getCenter().lng
        , 'zoom': map.getZoom()
      }, function () {
        elem.text(elem.data('saved'));

        setTimeout(function () {
          elem.text(elem.data('default'));
        }, 1000);
      })
  });

  Mousetrap.bind('s', function () {
    $('.js-search').click();
    return false;
  });

  Mousetrap.bind('S', function () {
    $('#share-modal').modal().show();
    return false;
  });

  Mousetrap.bind('c', function () {
    $('.js-save-center').click();
    return false;
  });

  Mousetrap.bind('x', function () {
    $('.js-settings').click();
    return false;
  });

  Mousetrap.bind('a', function () {
    if (adding) {
      $.addingMode(false);
    } else {
      $('.js-add-marker').click();
    }
    return false;
  });

  Mousetrap.bind('?', function () {
    $('#about-modal').modal().show();
    return false;
  });

  Mousetrap.bind('e', function () {
    $('.js-edit').click();
    return false;
  });

  Mousetrap.bind('escape', function () {
    if (adding) {
      $.addingMode(false);
      return false;
    }
  });
});

$.feature('f_maps_login', function () {
  var modal = $('#login-modal');
  var form = modal.find('form');

  modal.modal();

  modal.on('shown.bs.modal', function (e) {
    form.find('[name=password]').focusAtEnd();
  });
  form.on('submit', function (e) {
    e.preventDefault();
    modal.find('.js-authenticate').click();
  });
});


var xhrData = {
  "map": {
      "lat": "51.50281238523426",
      "lng": "-0.10179519653320314",
      "zoom": 14,
      "layer": "mapbox/streets-v11",
      "brand": "<i class=\"icon-map m-auto pr-3\"></i>Ethermap: mytravelmap\n",
      "title": "mytravelmap &mdash; ethermap\n"
  },
  "markers": [
      {
        "lat": 41.38879,
        "lng": 2.15899,
        "icon": "blue",
        "title": "Barcelona",
        "html": "<div class=\"marker\">\n  \n  <h6>Barcelona</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/iTNQndwQ2te4/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/iTNQndwQ2te4/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "46.05062000000004",
          "lng": "14.502820000000042",
          "icon": "blue",
          "title": "Ljubljana",
          "html": "<div class=\"marker\">\n  \n  <h6>Ljubljana</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/iTNQndwQ2te4/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/iTNQndwQ2te4/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "45.43811000000005",
          "lng": "12.31815000000006",
          "icon": "blue",
          "title": "Venice",
          "html": "<div class=\"marker\">\n  \n  <h6>Venice</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/iTNQndwQ2te4/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/iTNQndwQ2te4/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "45.46796000000006",
          "lng": "9.18178000000006",
          "icon": "blue",
          "title": "Milan",
          "html": "<div class=\"marker\">\n  \n  <h6>Milan</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/iTNQndwQ2te4/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/iTNQndwQ2te4/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "-22.968677613589563",
          "lng": "-43.18553924560547",
          "icon": "blue",
          "title": "Rio",
          "html": "<div class=\"marker\">\n  \n  <h6>Rio</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/iTNQndwQ2te4/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/iTNQndwQ2te4/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "50.84808000000004",
          "lng": "4.350870000000043",
          "icon": "blue",
          "title": "Brussels",
          "html": "<div class=\"marker\">\n  \n  <h6>Brussels</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/0fizlidC0PT1/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/0fizlidC0PT1/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "38.69670000000008",
          "lng": "-9.420399999999972",
          "icon": "blue",
          "title": "Cascias",
          "html": "<div class=\"marker\">\n  \n  <h6>Cascias</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/MR1FWerB5j4Q/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/MR1FWerB5j4Q/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "38.80097000000006",
          "lng": "-9.378259999999955",
          "icon": "blue",
          "title": "Cintra",
          "html": "<div class=\"marker\">\n  \n  <h6>Cintra</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/ISSlOs70gbG8/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/ISSlOs70gbG8/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "38.726330000000075",
          "lng": "-9.149509999999964",
          "icon": "blue",
          "title": "Lisbon",
          "html": "<div class=\"marker\">\n  \n  <h6>Lisbon</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/uLTniygbcQCQ/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/uLTniygbcQCQ/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "54.40119000000004",
          "lng": "-2.9389699999999266",
          "icon": "blue",
          "title": "Lake district",
          "html": "<div class=\"marker\">\n  \n  <h6>Lake district</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/n2LAE6uBUbxC/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/n2LAE6uBUbxC/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "53.47895624300003",
          "lng": "-2.2452757659999634",
          "icon": "blue",
          "title": "Manchester",
          "html": "<div class=\"marker\">\n  \n  <h6>Manchester</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/3Ul1QvpANKTG/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/3Ul1QvpANKTG/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "54.59534000000008",
          "lng": "-5.934549999999945",
          "icon": "blue",
          "title": "Belfast",
          "html": "<div class=\"marker\">\n  \n  <h6>Belfast</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/uqgQVrkboukH/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/uqgQVrkboukH/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "52.23787324800003",
          "lng": "-0.8950311999999485",
          "icon": "blue",
          "title": "Northampton",
          "html": "<div class=\"marker\">\n  \n  <h6>Northampton</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/RzpjwoXV0tLN/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/RzpjwoXV0tLN/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "50.82361005300004",
          "lng": "-0.1435251579999317",
          "icon": "blue",
          "title": "Brighton",
          "html": "<div class=\"marker\">\n  \n  <h6>Brighton</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/DUTjXhHQrm29/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/DUTjXhHQrm29/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "51.75198265700004",
          "lng": "-1.2576286229999596",
          "icon": "blue",
          "title": "Oxford",
          "html": "<div class=\"marker\">\n  \n  <h6>Oxford</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/rwX9sRJTLX9T/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/rwX9sRJTLX9T/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "51.12814450600007",
          "lng": "1.3084587410000381",
          "icon": "blue",
          "title": "Dover",
          "html": "<div class=\"marker\">\n  \n  <h6>Dover</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/LgglfqN7ijwc/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/LgglfqN7ijwc/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "51.507408360000056",
          "lng": "-0.12769869299995662",
          "icon": "blue",
          "title": "London",
          "html": "<div class=\"marker\">\n  \n  <h6>London</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/5ahlPdZlLAB3/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/5ahlPdZlLAB3/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "59.91234000000003",
          "lng": "10.750000000000057",
          "icon": "blue",
          "title": "Oslo",
          "html": "<div class=\"marker\">\n  \n  <h6>Oslo</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/kToc1cXLPY0P/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/kToc1cXLPY0P/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "69.65139000000005",
          "lng": "18.956060000000036",
          "icon": "blue",
          "title": "Tromso",
          "html": "<div class=\"marker\">\n  \n  <h6>Tromso</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/FfISHOoApr9l/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/FfISHOoApr9l/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "68.35064000000006",
          "lng": "18.83259000000004",
          "icon": "blue",
          "title": "Abisko",
          "html": "<div class=\"marker\">\n  \n  <h6>Abisko</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/iUhmYqHYgA7j/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/iUhmYqHYgA7j/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "65.58387000000005",
          "lng": "22.152210000000025",
          "icon": "blue",
          "title": "Lulea",
          "html": "<div class=\"marker\">\n  \n  <h6>Lulea</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/DhPBxOsbzGzd/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/DhPBxOsbzGzd/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "63.82529000000005",
          "lng": "20.260590000000036",
          "icon": "blue",
          "title": "Umea",
          "html": "<div class=\"marker\">\n  \n  <h6>Umea</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/IYMWbv25Kd7A/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/IYMWbv25Kd7A/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "59.33257000000003",
          "lng": "18.06683000000004",
          "icon": "blue",
          "title": "Stockholm",
          "html": "<div class=\"marker\">\n  \n  <h6>Stockholm</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/RuMod0rCYr7V/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/RuMod0rCYr7V/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "28.468240000000037",
          "lng": "-16.25461999999993",
          "icon": "blue",
          "title": "Tenerife",
          "html": "<div class=\"marker\">\n  \n  <h6>Tenerife</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/vokKry2FqFIR/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/vokKry2FqFIR/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "52.51604000000003",
          "lng": "13.376910000000066",
          "icon": "blue",
          "title": "Berlin",
          "html": "<div class=\"marker\">\n  \n  <h6>Berlin</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/vMEflctMvQvq/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/vMEflctMvQvq/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "52.36993000000007",
          "lng": "4.907880000000034",
          "icon": "blue",
          "title": "Amsterdam",
          "html": "<div class=\"marker\">\n  \n  <h6>Amsterdam</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/f0RBybvH4Iz1/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/f0RBybvH4Iz1/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "12.324883937000038",
          "lng": "75.80527844000005",
          "icon": "blue",
          "title": "Coorg",
          "html": "<div class=\"marker\">\n  \n  <h6>Coorg</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/urjXfIyx4utp/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/urjXfIyx4utp/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "55.67567000000008",
          "lng": "12.567560000000071",
          "icon": "blue",
          "title": "Copenhegen",
          "html": "<div class=\"marker\">\n  \n  <h6>Copenhegen</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/xBkfuDI5lnIW/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/xBkfuDI5lnIW/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "55.59669000000008",
          "lng": "13.001100000000065",
          "icon": "blue",
          "title": "Malmo",
          "html": "<div class=\"marker\">\n  \n  <h6>Malmo</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/ChhS6wTbXIWg/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/ChhS6wTbXIWg/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "50.07913000000008",
          "lng": "14.433020000000056",
          "icon": "blue",
          "title": "Prague",
          "html": "<div class=\"marker\">\n  \n  <h6>Prague</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/49R64UYWLT9E/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/49R64UYWLT9E/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "47.49972000000008",
          "lng": "19.055080000000032",
          "icon": "blue",
          "title": "Budapest",
          "html": "<div class=\"marker\">\n  \n  <h6>Budapest</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/9Jc1bx0WdZEq/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/9Jc1bx0WdZEq/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "22.60137000000003",
          "lng": "82.67786000000007",
          "icon": "blue",
          "title": "Satrenga",
          "html": "<div class=\"marker\">\n  \n  <h6>Satrenga</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/AmUoOcpxsg0o/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/AmUoOcpxsg0o/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "22.361392451742404",
          "lng": "82.68722534179689",
          "icon": "blue",
          "title": "Korba",
          "html": "<div class=\"marker\">\n  \n  <h6>Korba</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/Upf2kgeNPIvl/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/Upf2kgeNPIvl/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "22.100714085351978",
          "lng": "82.15164184570314",
          "icon": "blue",
          "title": "Bilaspur",
          "html": "<div class=\"marker\">\n  \n  <h6>Bilaspur</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/nnyjbNhFnghF/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/nnyjbNhFnghF/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "21.21629996476941",
          "lng": "81.37367248535158",
          "icon": "blue",
          "title": "Bhilai",
          "html": "<div class=\"marker\">\n  \n  <h6>Bhilai</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/P8frXQN86dbV/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/P8frXQN86dbV/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "21.244348982458195",
          "lng": "81.63528442382814",
          "icon": "blue",
          "title": "Raipur",
          "html": "<div class=\"marker\">\n  \n  <h6>Raipur</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/q5JuBVdi4x91/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/q5JuBVdi4x91/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "22.716220000000078",
          "lng": "75.86512000000005",
          "icon": "blue",
          "title": "Indore",
          "html": "<div class=\"marker\">\n  \n  <h6>Indore</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/0ZzomCnFtdXQ/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/0ZzomCnFtdXQ/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "52.235600000000034",
          "lng": "21.010370000000023",
          "icon": "blue",
          "title": "Warsaw",
          "html": "<div class=\"marker\">\n  \n  <h6>Warsaw</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/gBvRAqhBS29l/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/gBvRAqhBS29l/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "67.80509000000006",
          "lng": "24.796140000000037",
          "icon": "blue",
          "title": "Levi, lapland",
          "html": "<div class=\"marker\">\n  \n  <h6>Levi, lapland</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/xdwkOOGYt9pM/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/xdwkOOGYt9pM/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "66.50392000000005",
          "lng": "25.72906000000006",
          "icon": "blue",
          "title": "Santa Village, Rovaneimi",
          "html": "<div class=\"marker\">\n  \n  <h6>Santa Village, Rovaneimi</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/l3QG0IIxppjk/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/l3QG0IIxppjk/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "60.169727834657785",
          "lng": "24.93896484375",
          "icon": "blue",
          "title": "Helsinki",
          "html": "<div class=\"marker\">\n  \n  <h6>Helsinki</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/JieYYD9syXlJ/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/JieYYD9syXlJ/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "50.06045000000006",
          "lng": "19.932420000000036",
          "icon": "blue",
          "title": "Krakow",
          "html": "<div class=\"marker\">\n  \n  <h6>Krakow</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/d0s34gxTMxeZ/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/d0s34gxTMxeZ/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "58.53861000000006",
          "lng": "23.438060000000064",
          "icon": "blue",
          "title": "Viirelaid",
          "html": "<div class=\"marker\">\n  \n  <h6>Viirelaid</h6>\n  \n\n  <p>Starship summer event</p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/QZPksAyvFPfw/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/QZPksAyvFPfw/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "58.146240000000034",
          "lng": "23.958780000000047",
          "icon": "blue",
          "title": "Kihnu Island",
          "html": "<div class=\"marker\">\n  \n  <h6>Kihnu Island</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/DtdkjmOrZsvj/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/DtdkjmOrZsvj/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "58.32848567410592",
          "lng": "25.551452636718754",
          "icon": "blue",
          "title": "Viljandi",
          "html": "<div class=\"marker\">\n  \n  <h6>Viljandi</h6>\n  \n\n  <p>Music festival</p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/DCxva7fI4hqp/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/DCxva7fI4hqp/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "58.56458013890097",
          "lng": "22.295722961425785",
          "icon": "blue",
          "title": "Panga cliff",
          "html": "<div class=\"marker\">\n  \n  <h6>Panga cliff</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/bNutVX6E82FC/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/bNutVX6E82FC/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "58.25513001997281",
          "lng": "22.47665405273438",
          "icon": "blue",
          "title": "Kuressaare",
          "html": "<div class=\"marker\">\n  \n  <h6>Kuressaare</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/Vq0WGjaNW8kM/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/Vq0WGjaNW8kM/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "58.427571071000045",
          "lng": "24.475298612000074",
          "icon": "blue",
          "title": "Parnu travel",
          "html": "<div class=\"marker\">\n  \n  <h6>Parnu travel</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/1tfnixHnUhTu/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/1tfnixHnUhTu/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "28.57671533937472",
          "lng": "77.18994140625",
          "icon": "blue",
          "title": "Delhi",
          "html": "<div class=\"marker\">\n  \n  <h6>Delhi</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/Y82HMSExhdg9/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/Y82HMSExhdg9/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "11.406540000000064",
          "lng": "76.70331000000004",
          "icon": "blue",
          "title": "Ooty",
          "html": "<div class=\"marker\">\n  \n  <h6>Ooty</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/rPNqMbnYs9uh/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/rPNqMbnYs9uh/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "14.552888674565349",
          "lng": "74.31096553802492",
          "icon": "blue",
          "title": "Gokarna",
          "html": "<div class=\"marker\">\n  \n  <h6>Gokarna</h6>\n  \n\n  <p>Travel</p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/6cDyViPWAdAZ/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/6cDyViPWAdAZ/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "32.21817472423234",
          "lng": "76.318416595459",
          "icon": "blue",
          "title": "Dharamshala",
          "html": "<div class=\"marker\">\n  \n  <h6>Dharamshala</h6>\n  \n\n  <p>Travel</p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/pBLt3y2y5z6x/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/pBLt3y2y5z6x/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "11.929500981829626",
          "lng": "79.82185363769531",
          "icon": "blue",
          "title": "Pondicherry",
          "html": "<div class=\"marker\">\n  \n  <h6>Pondicherry</h6>\n  \n\n  <p>Travel</p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/wRD3jvf9G0KA/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/wRD3jvf9G0KA/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "30.455628793612007",
          "lng": "78.0714225769043",
          "icon": "blue",
          "title": "Mussorrie",
          "html": "<div class=\"marker\">\n  \n  <h6>Mussorrie</h6>\n  \n\n  <p>Travel</p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/w4E0brNOuckV/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/w4E0brNOuckV/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "32.23995656318948",
          "lng": "77.18728065490724",
          "icon": "blue",
          "title": "Manali",
          "html": "<div class=\"marker\">\n  \n  <h6>Manali</h6>\n  \n\n  <p>Travel</p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/zKdEKZgIEgsQ/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/zKdEKZgIEgsQ/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "32.00971354281871",
          "lng": "77.31370925903322",
          "icon": "blue",
          "title": "Kasol",
          "html": "<div class=\"marker\">\n  \n  <h6>Kasol</h6>\n  \n\n  <p>Travel</p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/jDoIRAIISy4m/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/jDoIRAIISy4m/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "15.353059119130291",
          "lng": "74.05059814453126",
          "icon": "blue",
          "title": "Goa",
          "html": "<div class=\"marker\">\n  \n  <h6>Goa</h6>\n  \n\n  <p>Traveling</p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/1zxSh1UdYGmz/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/1zxSh1UdYGmz/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "59.436521902557146",
          "lng": "24.73743438720703",
          "icon": "blue",
          "title": "Tallinn",
          "html": "<div class=\"marker\">\n  \n  <h6>Tallinn</h6>\n  \n\n  <p>Stayed here for work @ Starship Technologies</p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/1d4agNNfE0uF/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/1d4agNNfE0uF/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "25.334096684794456",
          "lng": "82.98763275146486",
          "icon": "blue",
          "title": "Banaras",
          "html": "<div class=\"marker\">\n  \n  <h6>Banaras</h6>\n  \n\n  <p>Stayed here for higher education</p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/eK6ClLkZ4fkm/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/eK6ClLkZ4fkm/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "24.490272947732038",
          "lng": "86.69672012329103",
          "icon": "blue",
          "title": "Deoghar",
          "html": "<div class=\"marker\">\n  \n  <h6>Deoghar</h6>\n  \n\n  <p>Stayed here for primary education</p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/1KQTZK4vGevG/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/1KQTZK4vGevG/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "17.445687870519194",
          "lng": "78.34979295730592",
          "icon": "blue",
          "title": "Hyderabad",
          "html": "<div class=\"marker\">\n  \n  <h6>Hyderabad</h6>\n  \n\n  <p>Attended College</p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/S8RgwSsxyQBc/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/S8RgwSsxyQBc/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "12.961735843534306",
          "lng": "77.58888244628908",
          "icon": "blue",
          "title": "Bangalore",
          "html": "<div class=\"marker\">\n  \n  <h6>Bangalore</h6>\n  \n\n  <p>Stayed here for work</p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/PxueUTwLXcPP/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/PxueUTwLXcPP/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "37.45523781879053",
          "lng": "-122.18444824218751",
          "icon": "blue",
          "title": "MPK",
          "html": "<div class=\"marker\">\n  \n  <h6>MPK</h6>\n  \n\n  <p>MPK, Palo Alto, Sunnyvale, Mountain View, SF</p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/MuhqZ3uSik0l/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/MuhqZ3uSik0l/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "37.004746084814784",
          "lng": "-122.05261230468751",
          "icon": "blue",
          "title": "Santa Cruz",
          "html": "<div class=\"marker\">\n  \n  <h6>Santa Cruz</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/BJNRsWl0gt6s/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/BJNRsWl0gt6s/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "36.58024660149866",
          "lng": "-121.87683105468751",
          "icon": "blue",
          "title": "Montrey",
          "html": "<div class=\"marker\">\n  \n  <h6>Montrey</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/PsAKGcHEnLlB/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/PsAKGcHEnLlB/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "40.734770989672406",
          "lng": "-73.64135742187501",
          "icon": "blue",
          "title": "New York",
          "html": "<div class=\"marker\">\n  \n  <h6>New York</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/OwbLdMXLN4FN/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/OwbLdMXLN4FN/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      },
      {
          "lat": "30.26759000000004",
          "lng": "-97.74298999999996",
          "icon": "blue",
          "title": "Austin",
          "html": "<div class=\"marker\">\n  \n  <h6>Austin</h6>\n  \n\n  <p></p>\n\n\n  \n  <div class=\"btn-group btn-group-sm\">\n    <a\n      href=\"#\"\n      class=\"btn btn-primary js-edit-marker\"\n      data-url=\"/xhr/mytravelmap/9pHDSTBBiLnv/edit\"\n    >Edit</a>\n    <a\n      href=\"#\"\n      class=\"btn btn-danger js-delete-marker\"\n      data-url=\"/xhr/mytravelmap/9pHDSTBBiLnv/delete\"\n      data-confirm=\"Are you sure you wish to remove this marker?\"\n    >Delete</a>\n    \n  </div>\n</div>\n"
      }
  ],
  "cachebust": "Q7AL63M1gQQT",
  "mapbox_access_token": "pk.eyJ1IjoiYW5pbWVzaDIwNDkiLCJhIjoiY2xma2FoMWpqMDkyMTN4cGVvaG13cHgxayJ9.uL10Tla-vyq6gGx5GXbLKw"
}