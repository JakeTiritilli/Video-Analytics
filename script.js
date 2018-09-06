/*
  Author: Jacob Tiritilli
  Version 1 (8/2/2017)
   ** Displays whole video label detections (and confidence of correctness)
      in a box below the running video.
  Version 2 (8/10/17)
   ** Added the dynamic creation of video subtitles with the label annotations that change
      based on the current shot.
  Makes use of the Google Cloud Video Intelligence API
*/

var GO_PRESSED = false;


function onGoPressed() {
  if (GO_PRESSED) {
    document.getElementById("results").innerHTML = "";
    var video = document.getElementById('video');
    var source = document.getElementById('vs');
    video.removeChild(source);
    document.getElementById("video").style.display = "none";
  }
  GO_PRESSED = true;
  requestNameField();
}


function displayVideo(uri, displayCaptions, shotAnnotations = [], labelAnnotations = []) {
  var video = document.getElementById('video'), track;
  var source = document.createElement('source');
  var videoUrl = "https://storage.googleapis.com/" + uri.slice(5);
  source.setAttribute('id', 'vs');
  source.setAttribute('src', videoUrl);
  video.appendChild(source);
  document.getElementById("video").style.display = "block";
  video.load();
  video.play();
  if (displayCaptions) {
    createCaptions(video, shotAnnotations, labelAnnotations);
  }
}


function createCaptions(video, shotAnnotations, labelAnnotations) {
  var shotLabelsAnnots = [{"start": 0, "end": shotAnnotations[0].endTimeOffset/1000000, annots: []}];
  for (var i = 1; i < shotAnnotations.length; i++) {
    shotLabelsAnnots.push({"start": shotAnnotations[i].startTimeOffset/1000000, "end": shotAnnotations[i].endTimeOffset/1000000, annots: []});
 }
 console.log(shotLabelsAnnots.length);
 var matches = matchLabelsToShots(shotLabelsAnnots, labelAnnotations);
 video.addEventListener("loadedmetadata", function() {
  track = this.addTextTrack("captions", "English", "en");
  track.mode = "showing";
  for (var i = 0; i < matches.length; i++) {
    track.addCue(new VTTCue(matches[i].start, matches[i].end, String(matches[i].annots)))
  }
})
}


function matchLabelsToShots(shots, labels) {
  var matches = shots;
  for (var i = 0; i < labels.length; i++) {
    for (var j = 0; j < labels[i].locations.length; j++) {
      if (labels[i].locations[j].level == "SHOT_LEVEL") {
        var labelStart = labels[i].locations[j].segment.startTimeOffset/1000000;
        if (isNaN(labelStart)) {
          labelStart = 0;
        }
        var labelEnd = labels[i].locations[j].segment.endTimeOffset/1000000;
        console.log("Times: ", labelStart, labelEnd);
        for (var k = 0; k < matches.length; k++) {
          if (labelStart >= matches[k].start && labelEnd <= matches[k].end) {
            matches[k].annots.push(labels[i].description);
          }
        }
      }
    }
  }
  console.log("Matches: ", matches);
  return matches;
}


function requestNameField() {
  document.getElementById("load").style.display = "block";
  document.getElementById("msg").style.display = "inline";
  var xhttp;
  var uri = document.getElementById("uri").value;
  var detectionTypes = [];
  var checkBoxes = document.getElementsByClassName('check');
  for (var i = 0; checkBoxes[i]; i++) {
    if (checkBoxes[i].checked) {
      detectionTypes.push(checkBoxes[i].value);
    }
  }
  console.log(typeof detectionTypes, detectionTypes);
  if (detectionTypes.length == 1) {
    console.log("true");
    displayVideo(uri, false);
  }
  if (window.XMLHttpRequest) {
    xhttp = new XMLHttpRequest();
  } else if (window.ActiveXObject) {
    xhttp = new ActiveXObject("Microsoft.XMLHTTP");
  }
  xhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
      getNameField(this);
    }
  };
  xhttp.open("POST", "https://videointelligence.googleapis.com/v1beta1/videos:annotate?key=AIzaSyCGmzowBhoV8Y3tflJDTWLQonDWTZeIaMw", true);
  xhttp.setRequestHeader("Content-type", "application/json");
  xhttp.send(JSON.stringify({inputUri: uri, features: detectionTypes}));
}


function getNameField(xhttp) {
  var obj = JSON.parse(xhttp.responseText);
  console.log(obj.name);
  requestAnalysis(obj.name);
}


function requestAnalysis(nameField) {
  var xhttp;
  var url = "https://videointelligence.googleapis.com/v1/operations/" + nameField + "?key=AIzaSyCGmzowBhoV8Y3tflJDTWLQonDWTZeIaMw"
  if (window.XMLHttpRequest) {
    xhttp = new XMLHttpRequest();
  } else if (window.ActiveXObject) {
    xhttp = new ActiveXObject("Microsoft.XMLHTTP");
  }
  xhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
      var obj = JSON.parse(xhttp.responseText);
      var meta = obj.metadata.annotationProgress;
      var retry = setTimeout(function() {
        if (!(checkProgress(meta))) {
          console.log("WAITING");
          requestAnalysis(nameField);
        }
      }, 5000);
      if (checkProgress(meta)) {
        console.log("CLEARED");
        clearTimeout(retry);
        filterAnalysis(xhttp, true, false);
      }
  }
};
  xhttp.open("GET", url, true);
  xhttp.send();
}


function checkProgress(annotationProgress) {
  for (var i = 0; i < annotationProgress.length; i++) {
    if (annotationProgress[i].progressPercent !== 100) {
      return false;
    }
  }
  return true;
}


function filterAnalysis(xhttp, withShotAnnots, withSafeAnnots) {
  var uri = document.getElementById("uri").value;
  var obj = JSON.parse(xhttp.responseText);
  var labelAnnots = obj.response.annotationResults[0].labelAnnotations;
  console.log(labelAnnots);
  console.log(obj);
  displayAnalysis(labelAnnots);
  if (withShotAnnots) {
    var shotAnnots = obj.response.annotationResults[0].shotAnnotations;
    displayVideo(uri, true, shotAnnots, labelAnnots);
  }
  if (withSafeAnnots) {
    var safeAnnots = obj.response.annotationResults[0].safeSearchAnnotations;
    checkAdultContent(safeAnnots);
  }
}


function checkAdultContent(safeAnnots) {
  var highestLikelihood = 0;
  var likelihood = {"UNKNOWN": 0, "VERY_UNLIKELY": 1, "UNLIKELY": 2, "POSSIBLE": 3, "LIKELY": 4, "VERY_LIKELY": 5};
  for (var i = 0; i < safeAnnots.length; i++) {
    contentNum = likelihood[safeAnnots[i].adult];
    if (contentNum > highestLikelihood) {
      highestLikelihood = contentNum;
    }
  }
  var displayMap = {0: "Unknown", 1: "Very Unlikely", 2: "Unlikely", 3: "Possible", 4: "Likely", 5: "Very Likely"};
  document.getElementById("result").innerHTML = displayMap[highestLikelihood];
  document.getElementById("safe_search").style.display = "block";
}


function displayAnalysis(labelAnnots) {
  var resultList = document.getElementById("results");
  document.getElementById("load").style.display = "none";
  document.getElementById("msg").style.display = "none";
  document.getElementById("label").style.display = "block";
  for (var i = 0; i < labelAnnots.length; i++) {
    var listItem = document.createElement("li");
    var confidence = labelAnnots[i].locations[0].confidence * 100;
    var rounded = Math.round(confidence);
    listItem.innerHTML = labelAnnots[i].description + " (Confidence: <span style='color: red'>" + rounded + "%</span>)";
    resultList.appendChild(listItem);
  }
  document.getElementById("labels").style.display = "block";
}
