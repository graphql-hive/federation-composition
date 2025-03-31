import { FieldNode, InlineFragmentNode, Kind, SelectionSetNode } from "graphql";
import { parseFields } from "../../../../subgraph/helpers.js";
import { stripTypeModifiers } from "../../../../utils/state.js";
import { SupergraphState } from "../../../state.js";

export type Field = {
  kind: "field";
  typeName: string;
  fieldName: string;
  selectionSet: null | Array<SelectionNode>;
};

export type Fragment = {
  kind: "fragment";
  typeName: string;
  selectionSet: Array<SelectionNode>;
};

export type SelectionNode = Field | Fragment;

export class Selection {
  constructor(
    private typeName: string,
    private source: string,
    public selectionSet: SelectionNode[],
  ) {}

  contains(typeName: string, fieldName: string) {
    return this._contains(typeName, fieldName, this.selectionSet);
  }

  equals(other: Selection) {
    if (this.typeName !== other.typeName) {
      return false;
    }

    if (this.source === other.source) {
      return true;
    }

    return this._selectionSetEqual(this.selectionSet, other.selectionSet);
  }

  private _selectionSetEqual(
    selectionSet: SelectionNode[],
    otherSelectionSet: SelectionNode[],
  ): boolean {
    if (selectionSet.length !== otherSelectionSet.length) {
      return false;
    }

    for (let i = 0; i < selectionSet.length; i++) {
      // Fields are sorted by typeName and fieldName, so we can compare them directly.
      // See: SelectionResolver#sort
      const selectionNode = selectionSet[i];
      const otherSelectionNode = otherSelectionSet[i];

      if (selectionNode.kind !== otherSelectionNode.kind) {
        return false;
      }

      // Compare typeName and fieldName
      if (selectionNode.typeName !== otherSelectionNode.typeName) {
        return false;
      }

      if (
        selectionNode.kind === "field" &&
        otherSelectionNode.kind === "field" &&
        selectionNode.fieldName !== otherSelectionNode.fieldName
      ) {
        return false;
      }

      const areEqual =
        // Compare selectionSet if both are arrays
        // Otherwise, compare nullability of selectionSet
        Array.isArray(selectionNode.selectionSet) &&
        Array.isArray(otherSelectionNode.selectionSet)
          ? this._selectionSetEqual(
              selectionNode.selectionSet,
              otherSelectionNode.selectionSet,
            )
          : selectionNode.selectionSet === otherSelectionNode.selectionSet;

      // Avoid unnecessary iterations if we already know that fields are not equal
      if (!areEqual) {
        return false;
      }
    }

    return true;
  }

  private _contains(
    typeName: string,
    fieldName: string,
    selectionSet: SelectionNode[],
  ): boolean {
    return selectionSet.some(
      (s) =>
        (s.kind === "field" &&
          s.typeName === typeName &&
          s.fieldName === fieldName) ||
        (s.selectionSet
          ? this._contains(typeName, fieldName, s.selectionSet)
          : false),
    );
  }

  toString() {
    return this.source.replace(/\s+/g, " ");
  }
}

export class SelectionResolver {
  private cache: Map<string, Selection> = new Map();

  constructor(private supergraphState: SupergraphState) {}

  resolve(typeName: string, keyFields: string): Selection {
    const key = this.keyFactory(typeName, keyFields);

    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    const typeState =
      this.supergraphState.objectTypes.get(typeName) ??
      this.supergraphState.interfaceTypes.get(typeName);

    if (!typeState) {
      throw new Error(
        `Expected an object/interface type when resolving keyFields of ${typeName}`,
      );
    }

    const selectionSetNode = parseFields(keyFields);

    if (!selectionSetNode) {
      throw new Error(
        `Expected a selection set when resolving keyFields of ${typeName}`,
      );
    }

    const fields = new Selection(
      typeName,
      keyFields,
      this.resolveSelectionSetNode(typeName, selectionSetNode),
    );
    this.cache.set(key, fields);

    return fields;
  }

  private keyFactory(typeName: string, keyFields: string) {
    return `${typeName}/${keyFields}`;
  }

  private resolveFieldNode(
    typeName: string,
    fieldNode: FieldNode,
    selectionSet: SelectionNode[],
  ) {
    if (fieldNode.name.value === "__typename") {
      return;
    }

    const typeState =
      this.supergraphState.objectTypes.get(typeName) ??
      this.supergraphState.interfaceTypes.get(typeName);

    if (!typeState) {
      throw new Error(`Type "${typeName}" is not defined.`);
    }

    if (!typeState.fields.has(fieldNode.name.value)) {
      throw new Error(
        `Type "${typeName.toString()}" does not have field "${fieldNode.name.value}".`,
      );
    }

    if (fieldNode.selectionSet) {
      const outputType = stripTypeModifiers(
        typeState.fields.get(fieldNode.name.value)!.type,
      );

      selectionSet.push({
        kind: "field",
        fieldName: fieldNode.name.value,
        typeName,
        selectionSet: this.resolveSelectionSetNode(
          outputType,
          fieldNode.selectionSet,
        ),
      });
    } else {
      // it's a leaf
      selectionSet.push({
        kind: "field",
        typeName,
        fieldName: fieldNode.name.value,
        selectionSet: null,
      });
    }
  }

  private resolveInlineFragmentNode(
    fragmentNode: InlineFragmentNode,
    selectionSet: SelectionNode[],
  ) {
    if (!fragmentNode.typeCondition?.name.value) {
      throw new Error(
        `Inline fragment without type condition is not supported.`,
      );
    }

    const typeName = fragmentNode.typeCondition.name.value;

    const typeState =
      this.supergraphState.objectTypes.get(typeName) ??
      this.supergraphState.interfaceTypes.get(typeName);

    if (!typeState) {
      throw new Error(`Type "${typeName}" is not defined.`);
    }

    selectionSet.push({
      kind: "fragment",
      typeName,
      selectionSet: this.resolveSelectionSetNode(
        typeName,
        fragmentNode.selectionSet,
      ),
    });
  }

  private resolveSelectionSetNode(
    typeName: string,
    selectionSetNode: SelectionSetNode,
    selectionSet: SelectionNode[] = [],
  ): SelectionNode[] {
    for (const selection of selectionSetNode.selections) {
      if (selection.kind === Kind.FIELD) {
        this.resolveFieldNode(typeName, selection, selectionSet);
      } else if (selection.kind === Kind.INLINE_FRAGMENT) {
        this.resolveInlineFragmentNode(selection, selectionSet);
      } else {
        throw new Error(`Fragment spread is not supported.`);
      }
    }

    return this.sort(selectionSet);
  }

  private sort(selectionSet: SelectionNode[]): SelectionNode[] {
    return selectionSet.sort((a, b) => {
      if (a.kind === b.kind) {
        return a.kind === "field" && b.kind === "field"
          ? // sort fields by typeName.fieldName
            `${a.typeName}.${a.fieldName}`.localeCompare(
              `${b.typeName}.${b.fieldName}`,
            )
          : // sort fragments by typeName
            a.typeName.localeCompare(b.typeName);
      }

      // field -> fragment
      return a.kind === "field" ? -1 : 1;
    });
  }
}
