import Service from "@ember/service";
import { set } from "@ember/object";
import { Promise } from "rsvp";
import RestModel from "discourse/models/rest";
import ResultSet from "discourse/models/result-set";
import { ajax } from "discourse/lib/ajax";
import { underscore } from "@ember/string";
import { warn } from "@ember/debug";
import { getOwner } from "discourse-common/lib/get-owner";

export default class Store extends Service {
  // Map<type, Map<id, {}>>
  #identityMap = new Map();

  _plurals = {
    category: "categories",
    "post-reply": "post-replies",
    "post-reply-history": "post_reply_histories",
    reviewable_history: "reviewable_histories",
  };

  // You should only call this if you're a test scaffold
  flushMap() {
    this.#identityMap.clear();
  }

  storeMap(type, id, obj) {
    if (id === undefined) {
      return;
    }

    // Normalize values (e.g. 2 vs "2")
    id = String(id);
    if (!this.#identityMap.has(type)) {
      this.#identityMap.set(type, new Map());
    }

    this.#identityMap.get(type).set(id, obj);
  }

  fromMap(type, id) {
    // Normalize values (e.g. 2 vs "2")
    id = String(id);
    return this.#identityMap.get(type)?.get(id);
  }

  removeMap(type, id) {
    // Normalize values (e.g. 2 vs "2")
    id = String(id);
    this.#identityMap.get(type)?.delete(id);
  }

  findAndRemoveMap(type, id) {
    // Normalize values (e.g. 2 vs "2")
    id = String(id);
    const byType = this.#identityMap.get(type);

    if (byType.has(id)) {
      const result = byType.get(id);
      byType.delete(id);
      return result;
    }
  }

  pluralize(thing) {
    return this._plurals[thing] || thing + "s";
  }

  addPluralization(thing, plural) {
    this._plurals[thing] = plural;
  }

  findAll(type, findArgs) {
    const adapter = this.adapterFor(type);

    return adapter.findAll(this, type, findArgs).then((result) => {
      let results = this._resultSet(type, result);
      if (adapter.afterFindAll) {
        results = adapter.afterFindAll(results, {
          lookup(subType, id) {
            return this._lookupSubType(subType, type, id, result);
          },
        });
      }
      return results;
    });
  }

  // Mostly for legacy, things like TopicList without ResultSets
  findFiltered(type, findArgs) {
    return this.adapterFor(type)
      .find(this, type, findArgs)
      .then((result) => this._build(type, result));
  }

  _hydrateFindResults(result, type, findArgs) {
    if (typeof findArgs === "object") {
      return this._resultSet(type, result, findArgs);
    } else {
      const apiName = this.adapterFor(type).apiNameFor(type);
      return this._hydrate(type, result[underscore(apiName)], result);
    }
  }

  // See if the store can find stale data. We sometimes prefer to show stale data and
  // refresh it in the background.
  findStale(type, findArgs, opts) {
    const stale = this.adapterFor(type).findStale(this, type, findArgs, opts);
    return {
      hasResults: stale !== undefined,
      results: stale,
      refresh: () => this.find(type, findArgs, opts),
    };
  }

  find(type, findArgs, opts) {
    let adapter = this.adapterFor(type);
    return adapter.find(this, type, findArgs, opts).then((result) => {
      let hydrated = this._hydrateFindResults(result, type, findArgs, opts);

      if (result.extras) {
        hydrated.set("extras", result.extras);
      }

      if (adapter.cache) {
        const stale = adapter.findStale(this, type, findArgs, opts);
        hydrated = this._updateStale(stale, hydrated, adapter.primaryKey);
        adapter.cacheFind(this, type, findArgs, opts, hydrated);
      }
      return hydrated;
    });
  }

  _updateStale(stale, hydrated, primaryKey) {
    if (!stale) {
      return hydrated;
    }

    hydrated.set(
      "content",
      hydrated.content.map((item) => {
        let staleItem = stale.content.findBy(primaryKey, item[primaryKey]);
        if (staleItem) {
          for (const [key, value] of Object.entries(
            Object.getOwnPropertyDescriptors(staleItem)
          )) {
            if (value.writable && value.enumerable) {
              staleItem.set(key, value.value);
            }
          }
        } else {
          staleItem = item;
        }
        return staleItem;
      })
    );
    return hydrated;
  }

  refreshResults(resultSet, type, url) {
    const adapter = this.adapterFor(type);
    return ajax(url).then((result) => {
      const typeName = underscore(this.pluralize(adapter.apiNameFor(type)));
      const content = result[typeName].map((obj) =>
        this._hydrate(type, obj, result)
      );
      resultSet.set("content", content);
    });
  }

  appendResults(resultSet, type, url) {
    const adapter = this.adapterFor(type);
    return ajax(url).then((result) => {
      const typeName = underscore(this.pluralize(adapter.apiNameFor(type)));

      let pageTarget = result.meta || result;
      let totalRows =
        pageTarget["total_rows_" + typeName] || resultSet.totalRows;
      let loadMoreUrl = pageTarget["load_more_" + typeName];
      let content = result[typeName].map((obj) =>
        this._hydrate(type, obj, result)
      );

      resultSet.setProperties({ totalRows, loadMoreUrl });
      resultSet.content.pushObjects(content);

      // If we've loaded them all, clear the load more URL
      if (resultSet.length >= totalRows) {
        resultSet.set("loadMoreUrl", null);
      }
    });
  }

  update(type, id, attrs) {
    const adapter = this.adapterFor(type);
    return adapter.update(this, type, id, attrs, (result) => {
      if (result?.[type]?.[adapter.primaryKey]) {
        const oldRecord = this.findAndRemoveMap(type, id);
        this.storeMap(type, result[type][adapter.primaryKey], oldRecord);
      }
      return result;
    });
  }

  createRecord(type, attrs) {
    attrs ||= {};
    const adapter = this.adapterFor(type);
    return !!attrs[adapter.primaryKey]
      ? this._hydrate(type, attrs)
      : this._build(type, attrs);
  }

  destroyRecord(type, record) {
    const adapter = this.adapterFor(type);

    // If the record is new, don't perform an Ajax call
    if (record.isNew) {
      this.removeMap(type, record[adapter.primaryKey]);
      return Promise.resolve(true);
    }

    return adapter.destroyRecord(this, type, record).then((result) => {
      this.removeMap(type, record[adapter.primaryKey]);
      return result;
    });
  }

  _resultSet(type, result, findArgs) {
    const adapter = this.adapterFor(type);
    const typeName = underscore(this.pluralize(adapter.apiNameFor(type)));

    if (!result[typeName]) {
      // eslint-disable-next-line no-console
      console.error(`JSON response is missing \`${typeName}\` key`, result);
      return;
    }

    const content = result[typeName].map((obj) =>
      this._hydrate(type, obj, result)
    );

    let pageTarget = result.meta || result;

    const createArgs = {
      content,
      findArgs,
      totalRows: pageTarget["total_rows_" + typeName] || content.length,
      loadMoreUrl: pageTarget["load_more_" + typeName],
      refreshUrl: pageTarget["refresh_" + typeName],
      resultSetMeta: result.meta,
      store: this,
      __type: type,
    };

    if (result.extras) {
      createArgs.extras = result.extras;
    }

    return ResultSet.create(createArgs);
  }

  _build(type, obj) {
    const adapter = this.adapterFor(type);
    obj.store = this;
    obj.__type = type;
    obj.__state = obj[adapter.primaryKey] ? "created" : "new";

    // TODO: Have injections be automatic
    const owner = getOwner(this);
    obj.topicTrackingState = owner.lookup("service:topic-tracking-state");
    obj.keyValueStore = owner.lookup("service:key-value-store");

    const klass = owner.factoryFor("model:" + type) || RestModel;
    const model = klass.create(obj);

    this.storeMap(type, obj[adapter.primaryKey], model);
    return model;
  }

  adapterFor(type) {
    const owner = getOwner(this);
    return owner.lookup("adapter:" + type) || owner.lookup("adapter:rest");
  }

  _lookupSubType(subType, type, id, root) {
    if (root.meta?.types) {
      subType = root.meta.types[subType] || subType;
    }

    const subTypeAdapter = this.adapterFor(subType);
    const pluralType = this.pluralize(subType);
    const collection = root[this.pluralize(subType)];

    if (collection) {
      const hashedProp = "__hashed_" + pluralType;
      let hashedCollection = root[hashedProp];

      if (!hashedCollection) {
        hashedCollection = {};
        for (const it of collection) {
          hashedCollection[it[subTypeAdapter.primaryKey]] = it;
        }
        root[hashedProp] = hashedCollection;
      }

      const found = hashedCollection[id];
      if (found) {
        const hydrated = this._hydrate(subType, found, root);
        hashedCollection[id] = hydrated;
        return hydrated;
      }
    }
  }

  _hydrateEmbedded(type, obj, root) {
    const adapter = this.adapterFor(type);

    Object.keys(obj).forEach((k) => {
      if (k === adapter.primaryKey) {
        return;
      }

      const m = /(.+)\_id(s?)$/.exec(k);
      if (m) {
        const subType = m[1];

        if (m[2]) {
          if (!Array.isArray(obj[k])) {
            warn(`Expected an array of resource ids for ${type}.${k}`, {
              id: "discourse.store.hydrate-embedded",
            });

            return;
          }

          const hydrated = obj[k].map((id) =>
            this._lookupSubType(subType, type, id, root)
          );

          obj[this.pluralize(subType)] = hydrated || [];
          delete obj[k];
        } else {
          const hydrated = this._lookupSubType(subType, type, obj[k], root);
          if (hydrated) {
            obj[subType] = hydrated;
            delete obj[k];
          } else {
            set(obj, subType, null);
          }
        }
      }
    });
  }

  _hydrate(type, obj, root) {
    if (!obj) {
      throw new Error("Can't hydrate " + type + " of `null`");
    }

    const adapter = this.adapterFor(type);

    const id = obj[adapter.primaryKey];
    if (!id) {
      throw new Error(
        `Can't hydrate ${type} without primaryKey: \`${adapter.primaryKey}\``
      );
    }

    root ||= obj;

    if (root.__rest_serializer === "1") {
      this._hydrateEmbedded(type, obj, root);
    }

    const existing = this.fromMap(type, id);
    if (existing === obj) {
      return existing;
    }

    if (existing) {
      delete obj[adapter.primaryKey];
      let klass = getOwner(this).factoryFor("model:" + type);

      if (klass?.class) {
        klass = klass?.class;
      }

      klass ||= RestModel;

      existing.setProperties(klass.munge(obj));
      obj[adapter.primaryKey] = id;
      return existing;
    }

    return this._build(type, obj);
  }
}
