/* global $ d3 */

// admin tools on archive
$(function () {
  // setup visits chart
  d3.json('/v1/admin/analytics/visits-by-day?unique=1', function ({visits}) {

    visits = visits.slice(-30, 30) // last 30
    visits.forEach(v => {
      v.date = v.date.split('-').slice(1).join('-')
    })
    console.log(visits)

    // set the dimensions and margins of the graph
    var margin = {top: 20, right: 20, bottom: 55, left: 40},
        width = 1000 - margin.left - margin.right,
        height = 200 - margin.top - margin.bottom;

    // set the ranges
    var xBandWidth = Math.min(10, visits.length) * 60
    var x = d3.scaleBand()
              .range([0, xBandWidth])
              .padding(0.1);
    var y = d3.scaleLinear()
              .range([height, 0]);
              
    // append the svg object to the body of the page
    // append a 'group' element to 'svg'
    // moves the 'group' element to the top left margin
    var svg = d3.select(".visits-chart")
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
})
