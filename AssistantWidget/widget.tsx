import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import r2wc from 'react-to-webcomponent';
import AssistantWidget from './AssistantWidget';

const WidgetElement = r2wc(AssistantWidget, React, ReactDOM, {
  props: { apiUrl: 'string' },
});

if (!customElements.get('assistant-widget')) {
  customElements.define('assistant-widget', WidgetElement);
}
