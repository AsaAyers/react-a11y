var assertions = require('./assertions');
var after = require('./after');

var shouldRunTest = (testName, options) => {
  var exclude = options.exclude || [];

  if (options.device == 'mobile') {
    exclude = new Set(exclude.concat(assertions.mobileExclusions));
    exclude = [...exclude];
  }

  return (exclude.indexOf(testName) == -1);
};

var runTagTests = (tagName, props, children, options, onFailure) => {
  var key;
  var tagTests = assertions.tags[tagName] || [];

  for (key in tagTests) {
    let testFailed = shouldRunTest(key, options) &&
      !tagTests[key].test(tagName, props, children);

    if (tagTests[key] && testFailed)
      onFailure(tagName, props, tagTests[key].msg);
   }
};

var runPropTests = (tagName, props, children, options, onFailure) => {
  var key;
  var propTests;

  for (var propName in props) {
    if (props[propName] === null || props[propName] === undefined) continue;

    propTests = assertions.props[propName] || [];

    for (key in propTests) {
      let testTailed = shouldRunTest(key, options) &&
        !propTests[key].test(tagName, props, children);

      if (propTests[key] && testTailed)
        onFailure(tagName, props, propTests[key].msg);
    }
  }
};

var runLabelTests = (tagName, props, children, options, onFailure) => {
  var key;
  var renderTests = assertions.render;

  for (key in renderTests) {
    if (shouldRunTest(key, options) && renderTests[key]) {
      let failureCB = onFailure.bind(
        undefined, tagName, props, renderTests[key].msg);

      renderTests[key].test(tagName, props, children, failureCB);
    }
  }
};

var runTests = (tagName, props, children, options, onFailure) => {
  var tests = [runTagTests, runPropTests, runLabelTests];
  tests.map((test) => {
    test(tagName, props, children, options, onFailure);
  });
};

var shouldShowError = (failureInfo, options) => {
  var filterFn = options.filterFn;
  if (filterFn)
    return filterFn(failureInfo.tagName, failureInfo.id);

  return true;
};

var throwError = (failureInfo, options) => {
  if (!shouldShowError(failureInfo, options))
    return;

  var error = [failureInfo.tagName, failureInfo.msg];

  if (options.includeSrcNode)
    error.push(failureInfo.id);

  throw new Error(error.join(' '));
};

var logAfterRender = (component, log) => {
  after(component, 'componentDidMount', log);
  after(component, 'componentDidUpdate', log);
};

var logWarning = (component, failureInfo, options) => {
  var includeSrcNode = options.includeSrcNode;

  var warn = () => {
    if (!shouldShowError(failureInfo, options))
      return;

    var warning = [failureInfo.tagName, failureInfo.msg];

    if (includeSrcNode && component) {
      // TODO:
      // 1) Consider using React.findDOMNode() over document.getElementById
      //    https://github.com/rackt/react-a11y/issues/54
      // 2) Consider using ref to expand element element reference logging
      //    to all element (https://github.com/rackt/react-a11y/issues/55)
      let srcNode = document.getElementById(failureInfo.id);

      // Guard against logging null element references should render()
      // return null or false.
      // https://facebook.github.io/react/docs/component-api.html#getdomnode
      if (srcNode)
        warning.push(srcNode);
    }

    console.warn.apply(console, warning);
  };

  if (includeSrcNode && component)
    // Cannot log a node reference until the component is in the DOM,
    // so defer the document.getElementById call until componentDidMount
    // or componentDidUpdate.
    logAfterRender(component._instance, warn);
  else
    warn();
};

var handleFailure = (options, reactEl, type, props, failureMsg) => {
  var includeSrcNode = options && !!options.includeSrcNode;
  var reactComponent = reactEl._owner;

  // If a Component instance, use the component's name,
  // if a ReactElement instance, use the tag name + id (e.g. div#foo)
  var name = reactComponent && reactComponent.getName() ||
    type + '#' + props.id;

  var failureInfo = {
    'tagName': name ,
    'id': props.id,
    'msg': failureMsg
  };

  var notifyOpts = {
    'includeSrcNode': includeSrcNode,
    'filterFn': options && options.filterFn
  };

  if (options && options.throw)
    throwError(failureInfo, notifyOpts);
  else
    logWarning(reactComponent, failureInfo, notifyOpts);
};


var _createElement;

var createId = function() {
  var nextId = 0;
  return (props) => {
    return (props.id || 'a11y-' + nextId++);
  };
}();

var reactA11y = (React, options) => {
  if (!React && !React.createElement) {
    throw new Error('Missing parameter: React');
  }

  assertions.setReact(React);

  _createElement = React.createElement;

  React.createElement = (type, _props, ...children) => {
    var props = _props || {};
    options = options || {};

    props.id = createId(props);
    var reactEl = _createElement.apply(this, [type, props].concat(children));
    var failureCB = handleFailure.bind(undefined, options, reactEl);

    if (typeof type === 'string')
      runTests(type, props, children, options, failureCB);

    return reactEl;
  };
};

module.exports = reactA11y;
