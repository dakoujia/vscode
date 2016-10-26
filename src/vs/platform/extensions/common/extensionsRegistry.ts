/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import Severity from 'vs/base/common/severity';
import { IActivationEventListener, IMessage, IExtensionDescription, IPointListener } from 'vs/platform/extensions/common/extensions';
import { Extensions, IJSONContributionRegistry } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { Registry } from 'vs/platform/platform';

export interface IExtensionMessageCollector {
	error(message: string): void;
	warn(message: string): void;
	info(message: string): void;
}

class ExtensionMessageCollector implements IExtensionMessageCollector {

	private _messageHandler: (msg: IMessage) => void;
	private _source: string;

	constructor(messageHandler: (msg: IMessage) => void, source: string) {
		this._messageHandler = messageHandler;
		this._source = source;
	}

	private _msg(type: Severity, message: string): void {
		this._messageHandler({
			type: type,
			message: message,
			source: this._source
		});
	}

	public error(message: string): void {
		this._msg(Severity.Error, message);
	}

	public warn(message: string): void {
		this._msg(Severity.Warning, message);
	}

	public info(message: string): void {
		this._msg(Severity.Info, message);
	}

}



interface IExtensionDescriptionMap {
	[extensionId: string]: IExtensionDescription;
}
const hasOwnProperty = Object.hasOwnProperty;
let schemaRegistry = <IJSONContributionRegistry>Registry.as(Extensions.JSONContribution);

export interface IExtensionPointUser<T> {
	description: IExtensionDescription;
	value: T;
	collector: IExtensionMessageCollector;
}

export interface IExtensionPointHandler<T> {
	(extensions: IExtensionPointUser<T>[]): void;
}

export interface IExtensionPoint<T> {
	name: string;
	setHandler(handler: IExtensionPointHandler<T>): void;
}

export interface IExtensionsRegistry {
	registerExtensions(extensionDescriptions: IExtensionDescription[]): void;

	getExtensionDescriptionsForActivationEvent(activationEvent: string): IExtensionDescription[];
	getAllExtensionDescriptions(): IExtensionDescription[];
	getExtensionDescription(extensionId: string): IExtensionDescription;

	registerOneTimeActivationEventListener(activationEvent: string, listener: IActivationEventListener): void;
	triggerActivationEventListeners(activationEvent: string): void;

	registerExtensionPoint<T>(extensionPoint: string, jsonSchema: IJSONSchema): IExtensionPoint<T>;
	handleExtensionPoints(messageHandler: (msg: IMessage) => void): void;
}

class ExtensionPoint<T> implements IExtensionPoint<T> {

	public name: string;
	private _registry: ExtensionsRegistryImpl;
	private _handler: IExtensionPointHandler<T>;
	private _messageHandler: (msg: IMessage) => void;

	constructor(name: string, registry: ExtensionsRegistryImpl) {
		this.name = name;
		this._registry = registry;
		this._handler = null;
		this._messageHandler = null;
	}

	setHandler(handler: IExtensionPointHandler<T>): void {
		if (this._handler) {
			throw new Error('Handler already set!');
		}
		this._handler = handler;
		this._handle();
	}

	handle(messageHandler: (msg: IMessage) => void): void {
		this._messageHandler = messageHandler;
		this._handle();
	}

	private _handle(): void {
		if (!this._handler || !this._messageHandler) {
			return;
		}

		this._registry.registerPointListener(this.name, (descriptions: IExtensionDescription[]) => {
			let users = descriptions.map((desc) => {
				return {
					description: desc,
					value: desc.contributes[this.name],
					collector: new ExtensionMessageCollector(this._messageHandler, desc.extensionFolderPath)
				};
			});
			this._handler(users);
		});
	}
}



const schemaId = 'vscode://schemas/vscode-extensions';
const schema: IJSONSchema = {
	default: {
		'name': '{{name}}',
		'description': '{{description}}',
		'author': '{{author}}',
		'version': '{{1.0.0}}',
		'main': '{{pathToMain}}',
		'dependencies': {}
	},
	properties: {
		engines: {
			properties: {
				'vscode': {
					type: 'string',
					description: nls.localize('vscode.extension.engines.vscode', 'For VS Code extensions, specifies the VS Code version that the extension is compatible with. Cannot be *. For example: ^0.10.5 indicates compatibility with a minimum VS Code version of 0.10.5.'),
					default: '^0.10.0',
				}
			}
		},
		publisher: {
			description: nls.localize('vscode.extension.publisher', 'The publisher of the VS Code extension.'),
			type: 'string'
		},
		displayName: {
			description: nls.localize('vscode.extension.displayName', 'The display name for the extension used in the VS Code gallery.'),
			type: 'string'
		},
		categories: {
			description: nls.localize('vscode.extension.categories', 'The categories used by the VS Code gallery to categorize the extension.'),
			type: 'array',
			uniqueItems: true,
			items: {
				type: 'string',
				enum: ['Languages', 'Snippets', 'Linters', 'Themes', 'Debuggers', 'Productivity', 'Other', 'Keymaps', 'Formatters']
			}
		},
		galleryBanner: {
			type: 'object',
			description: nls.localize('vscode.extension.galleryBanner', 'Banner used in the VS Code marketplace.'),
			properties: {
				color: {
					description: nls.localize('vscode.extension.galleryBanner.color', 'The banner color on the VS Code marketplace page header.'),
					type: 'string'
				},
				theme: {
					description: nls.localize('vscode.extension.galleryBanner.theme', 'The color theme for the font used in the banner.'),
					type: 'string',
					enum: ['dark', 'light']
				}
			}
		},
		contributes: {
			description: nls.localize('vscode.extension.contributes', 'All contributions of the VS Code extension represented by this package.'),
			type: 'object',
			properties: {
				// extensions will fill in
			},
			default: {}
		},
		preview: {
			type: 'boolean',
			description: nls.localize('vscode.extension.preview', 'Sets the extension to be flagged as a Preview in the Marketplace.'),
		},
		activationEvents: {
			description: nls.localize('vscode.extension.activationEvents', 'Activation events for the VS Code extension.'),
			type: 'array',
			items: {
				type: 'string',
				defaultSnippets: [{ label: 'onLanguage', body: 'onLanguage:{{languageId}}' }, { label: 'onCommand', body: 'onCommand:{{commandId}}' }, { label: 'onDebug', body: 'onDebug:{{type}}' }, { label: 'workspaceContains', body: 'workspaceContains:{{fileName}}' }],
			}
		},
		badges: {
			type: 'array',
			description: nls.localize('vscode.extension.badges', 'Array of badges to display in the sidebar of the Marketplace\'s extension page.'),
			items: {
				type: 'object',
				required: ['url', 'href', 'description'],
				properties: {
					url: {
						type: 'string',
						description: nls.localize('vscode.extension.badges.url', 'Badge image URL.')
					},
					href: {
						type: 'string',
						description: nls.localize('vscode.extension.badges.href', 'Badge link.')
					},
					description: {
						type: 'string',
						description: nls.localize('vscode.extension.badges.description', 'Badge description.')
					}
				}
			}
		},
		extensionDependencies: {
			description: nls.localize('vscode.extension.extensionDependencies', 'Dependencies to other extensions. The identifier of an extension is always ${publisher}.${name}. For example: vscode.csharp.'),
			type: 'array',
			uniqueItems: true,
			items: {
				type: 'string'
			}
		},
		scripts: {
			type: 'object',
			properties: {
				'vscode:prepublish': {
					description: nls.localize('vscode.extension.scripts.prepublish', 'Script executed before the package is published as a VS Code extension.'),
					type: 'string'
				}
			}
		},
		icon: {
			type: 'string',
			description: nls.localize('vscode.extension.icon', 'The path to a 128x128 pixel icon.')
		}
	}
};

interface IPointListenerEntry {
	extensionPoint: string;
	listener: IPointListener;
}

class ExtensionsRegistryImpl implements IExtensionsRegistry {

	private _extensionsMap: IExtensionDescriptionMap;
	private _extensionsArr: IExtensionDescription[];
	private _activationMap: { [activationEvent: string]: IExtensionDescription[]; };
	private _pointListeners: IPointListenerEntry[];
	private _oneTimeActivationEventListeners: { [activationEvent: string]: IActivationEventListener[]; };
	private _extensionPoints: { [extPoint: string]: ExtensionPoint<any>; };

	constructor() {
		this._extensionsMap = {};
		this._extensionsArr = [];
		this._activationMap = {};
		this._pointListeners = [];
		this._extensionPoints = {};
		this._oneTimeActivationEventListeners = {};
	}

	public registerPointListener(point: string, handler: IPointListener): void {
		let entry = {
			extensionPoint: point,
			listener: handler
		};
		this._pointListeners.push(entry);
		this._triggerPointListener(entry, ExtensionsRegistryImpl._filterWithExtPoint(this.getAllExtensionDescriptions(), point));
	}

	public registerExtensionPoint<T>(extensionPoint: string, jsonSchema: IJSONSchema): IExtensionPoint<T> {
		if (hasOwnProperty.call(this._extensionPoints, extensionPoint)) {
			throw new Error('Duplicate extension point: ' + extensionPoint);
		}
		let result = new ExtensionPoint<T>(extensionPoint, this);
		this._extensionPoints[extensionPoint] = result;

		schema.properties['contributes'].properties[extensionPoint] = jsonSchema;
		schemaRegistry.registerSchema(schemaId, schema);

		return result;
	}

	public handleExtensionPoints(messageHandler: (msg: IMessage) => void): void {
		Object.keys(this._extensionPoints).forEach((extensionPointName) => {
			this._extensionPoints[extensionPointName].handle(messageHandler);
		});
	}

	private _triggerPointListener(handler: IPointListenerEntry, desc: IExtensionDescription[]): void {
		// console.log('_triggerPointListeners: ' + desc.length + ' OF ' + handler.extensionPoint);
		if (!desc || desc.length === 0) {
			return;
		}
		try {
			handler.listener(desc);
		} catch (e) {
			onUnexpectedError(e);
		}
	}

	public registerExtensions(extensionDescriptions: IExtensionDescription[]): void {
		for (let i = 0, len = extensionDescriptions.length; i < len; i++) {
			let extensionDescription = extensionDescriptions[i];

			if (hasOwnProperty.call(this._extensionsMap, extensionDescription.id)) {
				// No overwriting allowed!
				console.error('Extension `' + extensionDescription.id + '` is already registered');
				continue;
			}

			this._extensionsMap[extensionDescription.id] = extensionDescription;
			this._extensionsArr.push(extensionDescription);

			if (Array.isArray(extensionDescription.activationEvents)) {
				for (let j = 0, lenJ = extensionDescription.activationEvents.length; j < lenJ; j++) {
					let activationEvent = extensionDescription.activationEvents[j];
					this._activationMap[activationEvent] = this._activationMap[activationEvent] || [];
					this._activationMap[activationEvent].push(extensionDescription);
				}
			}
		}

		for (let i = 0, len = this._pointListeners.length; i < len; i++) {
			let listenerEntry = this._pointListeners[i];
			let descriptions = ExtensionsRegistryImpl._filterWithExtPoint(extensionDescriptions, listenerEntry.extensionPoint);
			this._triggerPointListener(listenerEntry, descriptions);
		}
	}

	private static _filterWithExtPoint(input: IExtensionDescription[], point: string): IExtensionDescription[] {
		return input.filter((desc) => {
			return (desc.contributes && hasOwnProperty.call(desc.contributes, point));
		});
	}

	public getExtensionDescriptionsForActivationEvent(activationEvent: string): IExtensionDescription[] {
		if (!hasOwnProperty.call(this._activationMap, activationEvent)) {
			return [];
		}
		return this._activationMap[activationEvent].slice(0);
	}

	public getAllExtensionDescriptions(): IExtensionDescription[] {
		return this._extensionsArr.slice(0);
	}

	public getExtensionDescription(extensionId: string): IExtensionDescription {
		if (!hasOwnProperty.call(this._extensionsMap, extensionId)) {
			return null;
		}
		return this._extensionsMap[extensionId];
	}

	public registerOneTimeActivationEventListener(activationEvent: string, listener: IActivationEventListener): void {
		if (!hasOwnProperty.call(this._oneTimeActivationEventListeners, activationEvent)) {
			this._oneTimeActivationEventListeners[activationEvent] = [];
		}
		this._oneTimeActivationEventListeners[activationEvent].push(listener);
	}

	public triggerActivationEventListeners(activationEvent: string): void {
		if (hasOwnProperty.call(this._oneTimeActivationEventListeners, activationEvent)) {
			let listeners = this._oneTimeActivationEventListeners[activationEvent];
			delete this._oneTimeActivationEventListeners[activationEvent];

			for (let i = 0, len = listeners.length; i < len; i++) {
				let listener = listeners[i];
				try {
					listener();
				} catch (e) {
					onUnexpectedError(e);
				}
			}
		}
	}

}


const PRExtensions = {
	ExtensionsRegistry: 'ExtensionsRegistry'
};
Registry.add(PRExtensions.ExtensionsRegistry, new ExtensionsRegistryImpl());
export const ExtensionsRegistry: IExtensionsRegistry = Registry.as(PRExtensions.ExtensionsRegistry);

schemaRegistry.registerSchema(schemaId, schema);