/* global $ d3 makeSafe moment */

// admin tools for service stats
$(function () {
  setupStats()
  setupCohortsChart()
  setupBarChart()
  $('.visits-table').hide()
  $('.show-visits-table').click(setupVisitorsTable)
  $('.referers-table').hide()
  $('.show-referers-table').click(setupReferersTable)
  $('#stats-time-select').on('change', setupStats)
  $('#chart-source-select').on('change', setupBarChart)
})

function setupVisitorsTable () {
  $('.show-visits-table').hide()
  $('.visits-table').show()
  $('.visits-table').DataTable({
    order: [[ 0, 'desc' ]],
    ajax: {
      url: '/v2/admin/analytics/events-count',
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

function setupReferersTable () {
  $('.show-referers-table').hide()
  $('.referers-table').show()
  $('.referers-table').DataTable({
    order: [[ 0, 'desc' ]],
    ajax: {
      url: '/v2/admin/analytics/events-count',
      data: {groupBy: 'referer', unique: '1'},
      dataSrc: ''
    },
    columns: [
      {data: 'count'},
      {data: function (row) {
        if (!row.referer) return '(none)'
        var url = makeSafe(row.referer)
        return `<a class="link" href="${url}" target="_blank">${url}</a>`
      }}
    ]
  })
}

function setupStats () {
  var time = $('#stats-time-select').val()
  var url = '/v2/admin/analytics/events-stats?period=' + time
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

function setupCohortsChart () {
  var url = '/v2/admin/analytics/cohorts'
  $('#cohorts-source').attr('href', url)
  $('#cohorts').html('')
  d3.json(url, function (cohortsRaw) {
    // make sure there are 15 continuous weeks
    var cohorts = []
    let weekCursor = moment()
    for (let i = 0; i < 15; i++) {
      // existing cohort?
      let weekCursorFormatted = weekCursor.format('YYYYWW')
      let v = cohortsRaw[weekCursorFormatted]

      // add item
      cohorts.unshift({
        cohort: weekCursor.format('MMMYY (w)'),
        // registered: v ? (v[1]||0) : 0,
        // activated:  v ? (v[2]||0) : 0,
        // active:     v ? (v[3]||0) : 0
        registered: v ? ((v[1] || 0) + (v[2] || 0) + (v[3] || 0)) : 0,
        activated: v ? ((v[2] || 0) + (v[3] || 0)) : 0,
        active: v ? ((v[3] || 0)) : 0
      })

      // move cursor
      weekCursor = weekCursor.subtract(1, 'week')
    }

    // set the dimensions and margins of the graph
    var margin = {top: 20, right: 20, bottom: 55, left: 40}
    var width = 1000 - margin.left - margin.right
    var height = 200 - margin.top - margin.bottom

    // set the ranges
    var x = d3.scaleBand()
              .range([0, width])
              .padding(0.5)
              .paddingInner(0.5)

    var y = d3.scaleLinear()
              .range([height, 0])

    // append the svg object to the body of the page
    // append a 'group' element to 'svg'
    // moves the 'group' element to the top left margin
    var svg = d3.select('#cohorts')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
      .append('g')
        .attr('transform',
              'translate(' + margin.left + ',' + margin.top + ')')

    // Scale the range of the cohorts in the domains
    x.domain(cohorts.map(function (d) { return d.cohort }))
    y.domain([0, d3.max(cohorts, function (d) { return d.registered })])

    // add bars
    var bar = svg.selectAll('.bar')
        .data(cohorts)
      .enter().append('g')
    bar
      .append('rect')
        .attr('class', 'bar registered')
        .attr('fill', 'purple')
        .attr('x', function (d) { return x(d.cohort) })
        .attr('width', x.bandwidth())
        .attr('y', function (d) { return y(d.registered) })
        .attr('height', function (d) { return height - y(d.registered) })
    bar
      .append('rect')
        .attr('class', 'bar activated')
        .attr('fill', 'blue')
        .attr('x', function (d) { return x(d.cohort) })
        .attr('width', x.bandwidth())
        .attr('y', function (d) { return y(d.activated) })
        .attr('height', function (d) { return height - y(d.activated) })
    bar
      .append('rect')
        .attr('class', 'bar active')
        .attr('fill', 'green')
        .attr('x', function (d) { return x(d.cohort) })
        .attr('width', x.bandwidth())
        .attr('y', function (d) { return y(d.active) })
        .attr('height', function (d) { return height - y(d.active) })

    // append the labels to the bars
    svg.selectAll('.bar-label')
        .data(cohorts)
      .enter().append('text')
        .attr('x', function (d) { return x(d.cohort) })
        .attr('y', function (d) { return y(d.registered) })
        .attr('dx', 0)
        .attr('dy', '-.35em')
        .text(function (d) { return `${d.registered}/${d.activated}/${d.active}` })

    // add the x Axis
    svg.append('g')
        .attr('class', 'x-label')
        .attr('transform', 'translate(0,' + height + ')')
        .call(d3.axisBottom(x))

    svg.selectAll('.x-label text')
        .attr('y', 20)

    // add the y Axis
    svg.append('g')
        .call(d3.axisLeft(y))
  })
}

function setupBarChart () {
  var event = $('#chart-source-select').val()
  var url = '/v2/admin/analytics/events-count?groupBy=date&unique=1&event=' + event
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
    var margin = {top: 20, right: 20, bottom: 55, left: 40}
    var width = 1000 - margin.left - margin.right
    var height = 200 - margin.top - margin.bottom

    // set the ranges
    var x = d3.scaleBand()
              .range([0, width])
              .padding(0.5)
              .paddingInner(0.5)

    var y = d3.scaleLinear()
              .range([height, 0])

    // append the svg object to the body of the page
    // append a 'group' element to 'svg'
    // moves the 'group' element to the top left margin
    var svg = d3.select('#chart')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
      .append('g')
        .attr('transform',
              'translate(' + margin.left + ',' + margin.top + ')')

    // format the visits
    visits.forEach(function (d) {
      d.count = +d.count
    })

    // Scale the range of the visits in the domains
    x.domain(visits.map(function (d) { return d.date }))
    y.domain([0, d3.max(visits, function (d) { return d.count })])

    // append the rectangles for the bar chart
    svg.selectAll('.bar')
        .data(visits)
      .enter().append('rect')
        .attr('class', 'bar')
        .attr('x', function (d) { return x(d.date) })
        .attr('width', x.bandwidth())
        .attr('y', function (d) { return y(d.count) })
        .attr('height', function (d) { return height - y(d.count) })

    // append the labels to the bars
    svg.selectAll('.bar-label')
        .data(visits)
      .enter().append('text')
        .attr('x', function (d) { return x(d.date) })
        .attr('y', function (d) { return y(d.count) })
        .attr('dx', function (d) { return x.bandwidth() / 2 - 8 })
        .attr('dy', '-.35em')
        .text(function (d) { return d.count })

    // add the x Axis
    svg.append('g')
        .attr('class', 'x-label')
        .attr('transform', 'translate(0,' + height + ')')
        .call(d3.axisBottom(x))

    svg.selectAll('.x-label text')
        .attr('y', 20)

    // add the y Axis
    svg.append('g')
        .call(d3.axisLeft(y))
  })
}
