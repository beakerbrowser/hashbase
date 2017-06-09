/* global $ d3 */

// admin tools on archive
$(function () {
  setupStats()
  setupBarChart()
  setupVisitorsTable()
  $('#stats-time-select').on('change', setupStats)
  $('#chart-source-select').on('change', setupBarChart)
})

function setupVisitorsTable () {
 $('.visits-table').DataTable({
   order: [[ 0, 'desc' ]],
    ajax: {
      url: '/v1/admin/analytics/events-count',
      data: {groupBy: 'url', unique: '1'},
      dataSrc: ''
    },
    columns: [
      {data: 'count'},
      {data: function (row) {
        var url = makeSafe(row.url)
        return `<a class="link" href="${url}" target="_blank">${url}</a>`
      }}
    ]
  })
}

function setupStats () {
  var time = $('#stats-time-select').val()
  var url = '/v1/admin/analytics/events-stats?period=' + time
  $.get(url, stats => {
    $('#stats tbody').html(`
      <tr>
        <td>${stats.visits}</td>
        <td>${stats.registrations}</td>
        <td>${stats.logins}</td>
        <td>${stats.upgrades}</td>
        <td>${stats.cancels}</td>
      </tr>
    `)
  })
}

function setupBarChart () {
  var event = $('#chart-source-select').val()
  var url = '/v1/admin/analytics/events-count?groupBy=date&unique=1&event=' + event
  $('#chart-source').attr('href', url)
  $('#chart').html('')
  d3.json(url, function (visitsRaw) {

    // make sure there are 30 continuous days
    var visits = []
    let dayCursor = moment()
    for (let i = 0; i < 30; i++) {
      // existing visit?
      let dayCursorFormatted = dayCursor.format('YYYY-MM-DD')
      let v = visitsRaw.find(v => v.date === dayCursorFormatted)

      // add item
      visits.unshift({
        date: dayCursor.format('M/DD'),
        count: v ? v.count : 0
      })

      // move cursor
      dayCursor = dayCursor.subtract(1, 'day')
    }

    // set the dimensions and margins of the graph
    var margin = {top: 20, right: 20, bottom: 55, left: 40},
        width = 1000 - margin.left - margin.right,
        height = 200 - margin.top - margin.bottom;

    // set the ranges
    var x = d3.scaleBand()
              .range([0, width])
              .padding(0.5)
              .paddingInner(0.5);

    var y = d3.scaleLinear()
              .range([height, 0]);
              
    // append the svg object to the body of the page
    // append a 'group' element to 'svg'
    // moves the 'group' element to the top left margin
    var svg = d3.select('#chart')
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g")
        .attr("transform", 
              "translate(" + margin.left + "," + margin.top + ")");

    // format the visits
    visits.forEach(function(d) {
      d.count = +d.count;
    });

    // Scale the range of the visits in the domains
    x.domain(visits.map(function(d) { return d.date; }));
    y.domain([0, d3.max(visits, function(d) { return d.count; })]);

    // append the rectangles for the bar chart
    svg.selectAll(".bar")
        .data(visits)
      .enter().append("rect")
        .attr("class", "bar")
        .attr("x", function(d) { return x(d.date); })
        .attr("width", x.bandwidth())
        .attr("y", function(d) { return y(d.count); })
        .attr("height", function(d) { return height - y(d.count); });

    // append the labels to the bars
    svg.selectAll(".bar-label")
        .data(visits)
      .enter().append("text")
        .attr("x", function(d) { return x(d.date); })
        .attr("y", function(d) { return y(d.count); })
        .attr("dx", function(d) { return x.bandwidth() / 2 - 8; })
        .attr("dy", "-.35em")
        .text(function(d) { return d.count; });

    // add the x Axis
    svg.append("g")
        .attr('class', 'x-label')
        .attr("transform", "translate(0," + height + ")")
        .call(d3.axisBottom(x));

    svg.selectAll('.x-label text')
        .attr('y', 20)

    // add the y Axis
    svg.append("g")
        .call(d3.axisLeft(y));
  })
}