import { specifiedScalarTypes } from 'graphql';
import type { Logger } from '../../../../utils/logger.js';
import { stripTypeModifiers } from '../../../../utils/state.js';
import type { EnumTypeState } from '../../../composition/enum-type.js';
import type {
  InterfaceTypeFieldState,
  InterfaceTypeState,
} from '../../../composition/interface-type.js';
import type { ObjectTypeFieldState, ObjectTypeState } from '../../../composition/object-type.js';
import type { ScalarTypeState } from '../../../composition/scalar-type.js';
import type { UnionTypeState } from '../../../composition/union-type.js';
import type { SupergraphState } from '../../../state.js';
import { SUPERGRAPH_ID } from './constants.js';
import {
  assertAbstractEdge,
  assertFieldEdge,
  Edge,
  isAbstractEdge,
  isEntityEdge,
  isFieldEdge,
} from './edge.js';
import { scoreKeyFields } from './helpers.js';
import { AbstractMove, EntityMove, FieldMove } from './moves.js';
import { Node } from './node.js';
import type { SelectionNode, SelectionResolver } from './selection.js';

export class Graph {
  private _warnedAboutIncorrectEdge = false;
  // We do it for two reasons:
  // 1. We want to be able to quickly find all nodes/edges of a given type
  // 2. We want to avoid array length limit
  private nodesByTypeIndex: Node[][] = [];
  // We have two indexes of edges:
  // 1. By head type
  // 2. By tail type
  // We do it to quickly pick edges by head/tail type, without iterating over all edges.
  private edgesByHeadTypeIndex: Edge[][] = [];
  private edgesByTailTypeIndex: Edge[][] = [];
  // To quickly find all nodes of a given type
  private typeNameToNodeIndexes = new Map<string, number[]>();
  // Stores: Type A -> points directly to type B,C,D
  private typeChildren: Set<string>[] = [];
  // Answers: Can Type A lead to Type B?
  private typeChildrenCache = new Map<string, boolean>();
  private isSubgraph: boolean;
  private logger: Logger;
  private id: string;
  private idSymbol: Symbol;

  constructor(
    logger: Logger,
    id: string | Symbol,
    public name: string,
    private supergraphState: SupergraphState,
    private selectionResolver: SelectionResolver,
    private ignoreInaccessible = false,
  ) {
    this.logger = logger.create('Graph');
    if (typeof id === 'string') {
      this.idSymbol = Symbol.for(id);
      this.id = id;
      this.isSubgraph = true;
    } else {
      this.idSymbol = id;
      this.id = id.toString();
      this.isSubgraph = this.idSymbol !== SUPERGRAPH_ID;
    }
  }

  addUnreachableTypes() {
    if (!this.isSupergraph()) {
      for (const [typeName, state] of this.supergraphState.objectTypes) {
        if (state.byGraph.has(this.id)) {
          this.createNodesAndEdgesForType(typeName);
        }
      }

      for (const [typeName, state] of this.supergraphState.scalarTypes) {
        if (state.byGraph.has(this.id)) {
          this.createNodeForScalarType(typeName);
        }
      }

      for (const [_, state] of this.supergraphState.enumTypes) {
        if (state.byGraph.has(this.id)) {
          this.createNodeForEnumType(state);
        }
      }

      for (const [_, state] of this.supergraphState.unionTypes) {
        if (state.byGraph.has(this.id)) {
          this.createNodeForUnionType(state);
        }
      }

      for (const [_, state] of this.supergraphState.interfaceTypes) {
        if (state.byGraph.has(this.id)) {
          this.createNodeForInterfaceType(state);
        }
      }
    }

    return this;
  }

  addFromRoots() {
    for (const typeName of ['Query', 'Mutation', 'Subscription']) {
      const typeState = this.supergraphState.objectTypes.get(typeName);

      if (typeState && this.trueOrIfSubgraphThen(() => typeState.byGraph.has(this.id))) {
        this.createNodesAndEdgesForType(typeState.name);
      }
    }

    return this;
  }

  /**
   * Add fields from @interfaceObject types
   */
  addInterfaceObjectFields() {
    if (this.isSubgraph) {
      throw new Error('Expected to be called only on supergraph');
    }

    for (const interfaceState of this.supergraphState.interfaceTypes.values()) {
      if (!interfaceState.hasInterfaceObject) {
        // This is a regular interface, we don't need to do anything
        continue;
      }

      for (const implementedBy of interfaceState.implementedBy) {
        const objectState = this.supergraphState.objectTypes.get(implementedBy);

        if (!objectState) {
          throw new Error(
            `Expected object type ${implementedBy} to be defined as it implements ${interfaceState.name}`,
          );
        }

        // If a Node is not defined, it means it's not reachable from the root as we first start from the root and add all reachable nodes
        const head = this.nodeOf(objectState.name, false);

        if (!head) {
          continue;
        }

        for (const [interfaceFieldName, interfaceField] of interfaceState.fields) {
          if (objectState.fields.has(interfaceFieldName)) {
            // It already has a field with the same name, we don't need to do anything
            continue;
          }

          // even though it's an object type...
          this.createEdgeForInterfaceTypeField(head, interfaceField);
        }
      }

      for (const [typeName, state] of this.supergraphState.objectTypes) {
        if (state.byGraph.has(this.id)) {
          this.createNodesAndEdgesForType(typeName);
        }
      }
    }
  }

  addFromEntities() {
    for (const typeState of this.supergraphState.objectTypes.values()) {
      if (typeState?.isEntity && this.trueOrIfSubgraphThen(() => typeState.byGraph.has(this.id))) {
        this.createNodesAndEdgesForType(typeState.name);
      }
    }

    return this;
  }

  addSubgraph(graph: Graph) {
    for (const node of graph.nodesByTypeIndex.flat()) {
      this.addNode(node.withoutState());
    }

    for (const edges of graph.edgesByHeadTypeIndex) {
      for (const edge of edges) {
        this.addEdge(edge);
      }
    }
  }

  private connectUnionOrInterface(
    nodeIndex: number,
    sameTypeNameNodeIndexes: number[],
    edgesToAdd: Edge[],
  ) {
    for (const headNode of this.nodesByTypeIndex[nodeIndex]) {
      const edges = this.edgesOfTail(headNode);

      if (edges.length === 0) {
        continue;
      }

      for (const otherNodeIndex of sameTypeNameNodeIndexes) {
        if (nodeIndex === otherNodeIndex) {
          continue;
        }

        for (const tailNode of this.nodesByTypeIndex[otherNodeIndex]) {
          if (headNode === tailNode) {
            continue;
          }

          for (const edge of edges) {
            edgesToAdd.push(new Edge(edge.head, edge.move, tailNode));
          }
        }
      }
    }
  }

  private connectEntities(
    nodeIndex: number,
    sameTypeNameNodeIndexes: number[],
    edgesToAdd: Edge[],
  ) {
    for (const headNode of this.nodesByTypeIndex[nodeIndex]) {
      for (const otherNodeIndex of sameTypeNameNodeIndexes) {
        if (nodeIndex === otherNodeIndex) {
          continue;
        }

        for (const tailNode of this.nodesByTypeIndex[otherNodeIndex]) {
          if (
            !(tailNode.typeState && 'isEntity' in tailNode.typeState && tailNode.typeState.isEntity)
          ) {
            continue;
          }
          const typeStateInGraph = tailNode.typeState.byGraph.get(tailNode.graphId);

          const keys = (typeStateInGraph?.keys ?? [])
            .slice()
            .sort((a, b) => scoreKeyFields(a.fields) - scoreKeyFields(b.fields));

          for (const key of keys) {
            if (key.resolvable) {
              edgesToAdd.push(
                new Edge(
                  headNode,
                  tailNode.typeState.kind === 'object'
                    ? new EntityMove(this.selectionResolver.resolve(headNode.typeName, key.fields))
                    : new AbstractMove(
                        this.selectionResolver.resolve(headNode.typeName, key.fields),
                      ),
                  tailNode,
                ),
              );
            }
          }
        }
      }
    }
  }

  private addProvidedInterfaceFields(
    head: Node,
    providedFields: SelectionNode[],
    queue: {
      head: Node;
      providedFields: SelectionNode[];
    }[],
  ) {
    const abstractIndexes = head.getAbstractEdgeIndexes(head.typeName);

    if (!abstractIndexes || abstractIndexes.length === 0) {
      throw new Error('Expected abstract indexes to be defined');
    }

    const interfaceFields: SelectionNode[] = [];

    const fieldsByType = new Map<string, SelectionNode[]>();

    for (const providedField of providedFields) {
      if (providedField.typeName === head.typeName) {
        interfaceFields.push(providedField);
        continue;
      }

      const existing = fieldsByType.get(providedField.typeName);

      if (existing) {
        existing.push(providedField);
      } else {
        fieldsByType.set(providedField.typeName, [providedField]);
      }
    }

    for (const [typeName, providedFields] of fieldsByType) {
      let edgeIndex: number | undefined;
      let edge: Edge | undefined;
      for (let i = 0; i < abstractIndexes.length; i++) {
        const index = abstractIndexes[i];
        const potentialEdge = this.edgesByHeadTypeIndex[head.index][index];

        if (!potentialEdge) {
          throw new Error('Expected edge to be defined');
        }

        if (potentialEdge.tail.typeName === typeName) {
          edgeIndex = index;
          edge = potentialEdge;
          break;
        }
      }

      if (typeof edgeIndex === 'undefined' || !edge) {
        throw new Error(`Expected an abstract edge matching "${typeName}" to be defined`);
      }

      const newTail = this.duplicateNode(edge.tail);
      const newEdge = new Edge(edge.head, edge.move, newTail);
      this.replaceEdgeAt(edge.head.index, edge.tail.index, newEdge, edgeIndex);

      queue.push({
        head: newTail,
        providedFields,
      });
    }

    if (!interfaceFields.length) {
      return;
    }

    for (const index of abstractIndexes) {
      const edge = this.edgesByHeadTypeIndex[head.index][index];

      if (!edge) {
        throw new Error('Expected edge to be defined');
      }

      assertAbstractEdge(edge);

      if (edge.isCrossGraphEdge()) {
        continue;
      }

      const newTail = this.duplicateNode(edge.tail);
      const newEdge = new Edge(edge.head, new AbstractMove(), newTail);
      this.replaceEdgeAt(edge.head.index, edge.tail.index, newEdge, index);

      queue.push({
        head: newTail,
        providedFields: interfaceFields.map(f => ({
          ...f,
          typeName: newTail.typeName,
        })),
      });
    }
  }

  private addProvidedField(
    head: Node,
    providedField: SelectionNode,
    queue: {
      head: Node;
      providedFields: SelectionNode[];
    }[],
  ) {
    // As we only need to check if all fields are reachable from the head, we can ignore __typename
    if (providedField.kind === 'field' && providedField.fieldName === '__typename') {
      return;
    }

    if (providedField.kind === 'fragment') {
      queue.push({
        head,
        providedFields: providedField.selectionSet,
      });
      return;
    }

    const indexes = head.getFieldEdgeIndexes(providedField.fieldName);

    if (!indexes || indexes.length === 0) {
      if (head.typeState?.kind === 'object') {
        throw new Error(
          'Expected indexes to be defined: ' +
            providedField.typeName +
            '.' +
            providedField.fieldName,
        );
      } else {
        throw new Error(
          `Expected ${providedField.typeName}.${providedField.fieldName} to be point to an object type, other kinds are not supported (received: ${head.typeState?.kind})`,
        );
      }
    }

    for (const index of indexes) {
      const edge = this.edgesByHeadTypeIndex[head.index][index];

      if (!edge) {
        throw new Error('Expected edge to be defined');
      }

      assertFieldEdge(edge);

      if (edge.isCrossGraphEdge()) {
        continue;
      }

      const newTail = this.duplicateNode(edge.tail);
      const newEdge = new Edge(
        edge.head,
        new FieldMove(
          edge.move.typeName,
          edge.move.fieldName,
          edge.move.requires,
          edge.move.provides,
          true,
        ),
        newTail,
      );
      this.replaceEdgeAt(edge.head.index, edge.tail.index, newEdge, index);

      if (providedField.selectionSet) {
        queue.push({
          head: newTail,
          providedFields: providedField.selectionSet,
        });
      }
    }
  }

  joinSubgraphs() {
    // for each entity type, we want to assign one entity node to a matching entity node in other subgraphs
    // for each interface type, we want to assign one interface node to a matching interface node in other subgraphs
    const edgesToAdd: Edge[] = [];

    for (let i = 0; i < this.nodesByTypeIndex.length; i++) {
      const typeNode = this.nodesByTypeIndex[i][0];

      if (!typeNode.typeState) {
        continue;
      }

      const otherNodesIndexes = this.getIndexesOfType(typeNode.typeName);

      if (!Array.isArray(otherNodesIndexes)) {
        continue;
      }

      if (
        (typeNode.typeState?.kind === 'object' || typeNode.typeState?.kind === 'interface') &&
        typeNode.typeState?.isEntity
      ) {
        this.connectEntities(i, otherNodesIndexes, edgesToAdd);

        for (const h of otherNodesIndexes) {
          const head = this.nodesByTypeIndex[h][0];

          // For example, if we have
          // Subgraph 1:
          //  type A @interfaceObject @key(fields: "id") {}
          // Subgraph 2:
          //  interface A @key(fields: "id") {}
          //  type B implements A @key(fields: "id") {}
          // We need to add an edge from A to B
          //
          // The general idea here is to allow to move from a type that implements an interface to another type that implements the same interface

          for (const interfaceName of typeNode.typeState.interfaces) {
            const interfaceNodes = this.nodesOf(interfaceName, false);

            if (interfaceNodes.length === 0) {
              continue;
            }

            const interfaceTypeNode = interfaceNodes[0];

            if (!interfaceTypeNode.typeState || interfaceTypeNode.typeState?.kind !== 'interface') {
              continue;
            }

            if (!interfaceTypeNode.typeState.hasInterfaceObject) {
              continue;
            }

            for (const interfaceNode of interfaceNodes) {
              if (interfaceNode.typeState?.kind !== 'interface') {
                throw new Error(
                  `Expected interfaceNode ${interfaceNode.toString()} to be an interface`,
                );
              }

              const keys = interfaceNode.typeState.byGraph.get(interfaceNode.graphId)?.keys;

              if (!keys || keys.length === 0) {
                continue;
              }

              for (const key of keys) {
                if (!key.resolvable) {
                  continue;
                }

                edgesToAdd.push(
                  new Edge(
                    head,
                    new AbstractMove(this.selectionResolver.resolve(interfaceName, key.fields)),
                    interfaceNode,
                  ),
                );
              }
            }
          }
        }
      } else if (typeNode.typeState.kind === 'union' || typeNode.typeState.kind === 'interface') {
        this.connectUnionOrInterface(i, otherNodesIndexes, edgesToAdd);
      }
    }

    while (edgesToAdd.length > 0) {
      const edge = edgesToAdd.pop();

      if (!edge) {
        throw new Error('Expected edge to be defined');
      }

      this.addEdge(edge);
    }

    // iterate over all edges
    for (let headIndex = 0; headIndex < this.edgesByHeadTypeIndex.length; headIndex++) {
      const edges = this.edgesByHeadTypeIndex[headIndex];
      for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
        const edge = edges[edgeIndex];

        // if it's a cross-graph edge, we don't want to resolve it
        if (edge.isCrossGraphEdge()) {
          continue;
        }

        // ignore non-field edges
        if (!(isFieldEdge(edge) && edge.move.provides)) {
          continue;
        }

        // find field edges that are provided and mark them as resolvable.
        // if they are not available, create them
        const newTail = this.duplicateNode(edge.tail);
        const newEdge = new Edge(edge.head, edge.move, newTail);
        this.replaceEdgeAt(headIndex, edge.tail.index, newEdge, edgeIndex);

        const queue: {
          head: Node;
          providedFields: SelectionNode[];
        }[] = [
          {
            head: newTail,
            providedFields: edge.move.provides.selectionSet,
          },
        ];

        while (queue.length > 0) {
          const item = queue.pop();

          if (!item) {
            throw new Error('Expected item to be defined');
          }

          const { head, providedFields } = item;

          if (head.typeState?.kind === 'interface') {
            this.addProvidedInterfaceFields(head, providedFields, queue);
            continue;
          }

          for (const providedField of providedFields) {
            this.addProvidedField(head, providedField, queue);
          }
        }
      }
    }

    return this;
  }

  private duplicateNode(originalNode: Node) {
    const newNode = this.createNode(
      originalNode.typeName,
      originalNode.typeState,
      originalNode.graphId,
      originalNode.graphName,
    );

    for (const edge of this.edgesOfHead(originalNode)) {
      this.addEdge(new Edge(newNode, edge.move, edge.tail));
    }

    return newNode;
  }

  private replaceEdgeAt(headIndex: number, tailIndex: number, newEdge: Edge, edgeIndex: number) {
    this.edgesByHeadTypeIndex[headIndex][edgeIndex] = newEdge;

    const newEdgesByTail: Edge[] = [];
    for (const edge of this.edgesByTailTypeIndex[tailIndex]) {
      if (edge !== newEdge) {
        newEdgesByTail.push(edge);
      }
    }

    newEdgesByTail.push(newEdge);
    this.edgesByTailTypeIndex[tailIndex] = newEdgesByTail;
  }

  print(asLink = false) {
    let str = 'digraph G {';

    if (this.supergraphState.objectTypes.has('Query')) {
      str += '\n root -> Query';
    }

    if (this.supergraphState.objectTypes.has('Mutation')) {
      str += '\n root -> Mutation';
    }

    if (this.supergraphState.objectTypes.has('Subscription')) {
      str += '\n root -> Subscription';
    }

    for (const edge of this.edgesByHeadTypeIndex.flat()) {
      if (edge.head.typeName === 'Query') {
        str += `\n  "Query" -> "${edge.head}";`;
      } else if (edge.head.typeName === 'Mutation') {
        str += `\n  "Mutation" -> "${edge.head}";`;
      } else if (edge.head.typeName === 'Subscription') {
        str += `\n  "Subscription" -> "${edge.head}";`;
      }

      str += `\n  "${edge.head}" -> "${edge.tail}" [label="${edge.move}"];`;
    }

    str += '\n}';

    if (asLink) {
      return `https://dreampuf.github.io/GraphvizOnline/#${encodeURIComponent(str)}`;
    }

    return str;
  }

  graphNameToId(graphName: string) {
    for (const [id, { graph }] of this.supergraphState.subgraphs) {
      if (graph.name === graphName) {
        return id;
      }
    }
  }

  nodeOf(typeName: string): Node;
  nodeOf(typeName: string, failIfMissing: true): Node;
  nodeOf(typeName: string, failIfMissing?: false): Node | undefined;
  nodeOf(typeName: string, failIfMissing = true) {
    const indexes = this.getIndexesOfType(typeName);

    if (!Array.isArray(indexes)) {
      if (failIfMissing) {
        throw new Error(`Expected TypeNode(${typeName}) to be inserted first in graph ${this.id}`);
      }

      return undefined;
    }

    if (indexes.length > 1) {
      throw new Error(`Expected only one node for ${typeName} in graph ${this.id}`);
    }

    return this.nodesByTypeIndex[indexes[0]][0];
  }

  nodesOf(typeName: string, failIfMissing = true) {
    const indexes = this.getIndexesOfType(typeName);

    if (!Array.isArray(indexes)) {
      if (failIfMissing) {
        throw new Error(`Expected TypeNode(${typeName}) to be inserted first in graph ${this.id}`);
      }

      return [];
    }

    const nodes: Node[] = [];

    for (const i of indexes) {
      for (const node of this.nodesByTypeIndex[i]) {
        nodes.push(node);
      }
    }

    return nodes;
  }

  private getSameGraphEdgesOfIndex(
    head: Node,
    indexes: number[] | undefined,
    kind: string,
  ): Edge[] {
    const edges: Edge[] = [];

    if (!indexes) {
      return [];
    }

    for (const i of indexes) {
      const edge = this.edgesByHeadTypeIndex[head.index][i];

      if (!edge) {
        throw new Error(`Expected edge to be defined at index ${i}`);
      }

      if (edge.head.graphName === head.graphName) {
        edges.push(edge);
        continue;
      }

      if (!this._warnedAboutIncorrectEdge) {
        console.error(`Expected edge to be in the same graph as head (${kind})` + edge.toString());
        this._warnedAboutIncorrectEdge = true;
      }
    }

    return edges;
  }

  fieldEdgesOfHead(head: Node, fieldName: string): Edge[] {
    return this.getSameGraphEdgesOfIndex(head, head.getFieldEdgeIndexes(fieldName), 'field');
  }

  abstractEdgesOfHead(head: Node) {
    return this.getSameGraphEdgesOfIndex(
      head,
      head.getAbstractEdgeIndexes(head.typeName),
      'abstract',
    );
  }

  entityEdgesOfHead(head: Node) {
    return this.getSameGraphEdgesOfIndex(head, head.getEntityEdgeIndexes(head.typeName), 'entity');
  }

  indirectEdgesOfHead(head: Node) {
    return this.getSameGraphEdgesOfIndex(
      head,
      head.getCrossGraphEdgeIndexes(head.typeName),
      'cross-graph',
    )
      .concat(
        this.getSameGraphEdgesOfIndex(head, head.getAbstractEdgeIndexes(head.typeName), 'abstract'),
      )
      .filter((edge, i, all) => all.indexOf(edge) === i);
  }

  edgesOfHead(head: Node) {
    return this.edgesByHeadTypeIndex[head.index]?.filter(e => e.head === head) ?? [];
  }

  edgesOfTail(tail: Node) {
    return this.edgesByTailTypeIndex[tail.index]?.filter(e => e.tail === tail) ?? [];
  }

  possibleTypesOf(typeName: string) {
    if (this.supergraphState.interfaceTypes.has(typeName)) {
      return Array.from(this.supergraphState.interfaceTypes.get(typeName)!.implementedBy);
    }

    if (this.supergraphState.unionTypes.has(typeName)) {
      return Array.from(this.supergraphState.unionTypes.get(typeName)!.members);
    }

    return [typeName];
  }

  canReachTypeFromType(fromTypeName: string, toTypeName: string): boolean {
    if (fromTypeName === toTypeName) {
      return true;
    }

    const fromTypeIndexes = this.getIndexesOfType(fromTypeName);
    if (!fromTypeIndexes) {
      return false;
    }

    // Mark all the nodes as not visited
    const visited: boolean[] = new Array(this.typeChildren.length).fill(false);

    // Create a queue for BFS
    const queue: string[] = [];

    for (const i of fromTypeIndexes) {
      // Mark the current node as visited and enqueue it
      visited[i] = true;
    }
    queue.push(fromTypeName);

    while (queue.length > 0) {
      const typeName = queue.shift();
      if (!typeName) {
        throw new Error('Unexpected end of queue');
      }

      const typeIndexes = this.getIndexesOfType(typeName);

      if (typeof typeIndexes === 'undefined') {
        throw new Error(`Could not find an index of type: ${typeName}`);
      }

      // Mark type accessible by From type
      this.typeChildrenCache.set(`${fromTypeName} -> ${typeName}`, true);

      if (typeName === toTypeName) {
        return true;
      }

      for (const typeIndex of typeIndexes) {
        const children = this.typeChildren[typeIndex];

        for (const childTypeName of children) {
          const childTypeIndexes = this.getIndexesOfType(childTypeName);
          if (typeof childTypeIndexes === 'undefined') {
            throw new Error(`Could not find an index of type: ${typeName}`);
          }

          for (const childTypeIndex of childTypeIndexes) {
            if (!visited[childTypeIndex]) {
              visited[childTypeIndex] = true;
              this.typeChildrenCache.set(`${fromTypeName} -> ${childTypeName}`, true);
              this.typeChildrenCache.set(`${typeName} -> ${childTypeName}`, true);
              queue.push(childTypeName);
            }
          }
        }
      }
    }

    this.typeChildrenCache.set(`${fromTypeName} -> ${toTypeName}`, false);
    return false;
  }

  private createNodesAndEdgesForType(typeName: string): Node {
    if (this.supergraphState.objectTypes.has(typeName)) {
      return this.createNodesAndEdgesForObjectType(this.supergraphState.objectTypes.get(typeName)!);
    }

    if (
      specifiedScalarTypes.some(t => t.name === typeName) ||
      this.supergraphState.scalarTypes.has(typeName)
    ) {
      return this.createNodeForScalarType(typeName);
    }

    if (this.supergraphState.enumTypes.has(typeName)) {
      return this.createNodeForEnumType(this.supergraphState.enumTypes.get(typeName)!);
    }

    if (this.supergraphState.unionTypes.has(typeName)) {
      return this.createNodeForUnionType(this.supergraphState.unionTypes.get(typeName)!);
    }

    if (this.supergraphState.interfaceTypes.has(typeName)) {
      return this.createNodeForInterfaceType(this.supergraphState.interfaceTypes.get(typeName)!);
    }

    throw new Error(`Not implemented path: createNodesAndEdgesForType(${typeName})`);
  }

  private ensureNonOrSingleNode(typeName: string) {
    const indexes = this.typeNameToNodeIndexes.get(typeName);

    if (!Array.isArray(indexes)) {
      return;
    }

    if (indexes.length > 1) {
      throw new Error(`Expected only one node for ${typeName} in graph ${this.id}`);
    }

    return this.nodesByTypeIndex[indexes[0]][0];
  }

  private createNodesAndEdgesForObjectType(typeState: ObjectTypeState) {
    const existing = this.ensureNonOrSingleNode(typeState.name);
    if (existing) {
      return existing;
    }

    const head = this.createTypeNode(typeState.name, typeState);

    for (const field of typeState.fields.values()) {
      if (this.trueOrIfSubgraphThen(() => field.byGraph.has(this.id))) {
        this.createEdgeForObjectTypeField(head, field);
      }
    }

    return head;
  }

  private createNodeForScalarType(typeName: string) {
    const existing = this.ensureNonOrSingleNode(typeName);
    if (existing) {
      return existing;
    }

    return this.createTypeNode(typeName, this.supergraphState.scalarTypes.get(typeName) ?? null);
  }

  private createNodeForEnumType(typeState: EnumTypeState) {
    const existing = this.ensureNonOrSingleNode(typeState.name);
    if (existing) {
      return existing;
    }

    return this.createTypeNode(typeState.name, typeState);
  }

  private createNodeForUnionType(typeState: UnionTypeState) {
    const existing = this.ensureNonOrSingleNode(typeState.name);
    if (existing) {
      return existing;
    }

    const head = this.createTypeNode(typeState.name, typeState);

    const members = this.isSupergraph()
      ? typeState.members
      : typeState.byGraph.get(this.id)?.members;

    if (members) {
      for (const memberTypeName of members) {
        const tail = this.createNodesAndEdgesForType(memberTypeName);
        // TODO: if it's inaccessible and this.ignoreInaccessible is true, we should not add the edge
        this.addEdge(new Edge(head, new AbstractMove(), tail));
      }
    }

    return head;
  }

  private createNodeForInterfaceType(typeState: InterfaceTypeState) {
    const existing = this.ensureNonOrSingleNode(typeState.name);
    if (existing) {
      return existing;
    }

    const head = this.createTypeNode(typeState.name, typeState);
    const implementedBy = this.isSupergraph()
      ? typeState.implementedBy
      : typeState.byGraph.get(this.id)?.implementedBy;

    if (implementedBy) {
      for (const memberTypeName of implementedBy) {
        const tail = this.createNodesAndEdgesForType(memberTypeName);
        this.addEdge(new Edge(head, new AbstractMove(), tail));
      }
    }

    if (typeState.hasInterfaceObject && this.isSubgraph) {
      // We need to add fields of interface types with @interfaceObject
      // but only add fields that are owned by the subgraph.
      for (const field of typeState.fields.values()) {
        if (field.byGraph.has(this.id)) {
          this.createEdgeForInterfaceTypeField(head, field);
        }
      }
    } else if (this.isSubgraph) {
      // We're adding just leafs
      for (const field of typeState.fields.values()) {
        if (field.isLeaf && field.byGraph.has(this.id)) {
          this.createEdgeForInterfaceTypeField(head, field);
        }
      }
    }

    return head;
  }

  private createEdgeForInterfaceTypeField(head: Node, field: InterfaceTypeFieldState) {
    if (this.ignoreInaccessible && field.inaccessible) {
      return;
    }

    const outputTypeName = stripTypeModifiers(field.type);
    const tail = this.createNodesAndEdgesForType(outputTypeName);

    if (!tail) {
      throw new Error(`Failed to create Node for ${outputTypeName} in subgraph ${this.id}`);
    }

    const requires = field.byGraph.get(head.graphId)?.requires;
    const provides = field.byGraph.get(head.graphId)?.provides;

    return this.addEdge(
      new Edge(
        head,
        new FieldMove(
          head.typeName,
          field.name,
          requires ? this.selectionResolver.resolve(head.typeName, requires) : null,
          provides ? this.selectionResolver.resolve(outputTypeName, provides) : null,
        ),
        tail,
      ),
    );
  }

  private createEdgeForObjectTypeField(head: Node, field: ObjectTypeFieldState) {
    if (this.ignoreInaccessible && field.inaccessible) {
      return;
    }

    if (this.isSupergraph() && field.byGraph.size === 1) {
      const graphId = Array.from(field.byGraph.keys())[0];
      const isExternal = field.byGraph.get(graphId)?.external === true;
      const isFederationV1 =
        this.supergraphState.subgraphs.get(graphId)?.federation.version === 'v1.0';

      if (isExternal && isFederationV1) {
        return;
      }
    }

    const outputTypeName = stripTypeModifiers(field.type);
    const tail = this.createNodesAndEdgesForType(outputTypeName);

    if (!tail) {
      throw new Error(`Failed to create Node for ${outputTypeName} in subgraph ${this.id}`);
    }

    if (this.isSupergraph()) {
      return this.addEdge(new Edge(head, new FieldMove(head.typeName, field.name), tail));
    }

    const requires = field.byGraph.get(head.graphId)?.requires;
    const provides = field.byGraph.get(head.graphId)?.provides;

    return this.addEdge(
      new Edge(
        head,
        new FieldMove(
          head.typeName,
          field.name,
          requires ? this.selectionResolver.resolve(head.typeName, requires) : null,
          provides ? this.selectionResolver.resolve(outputTypeName, provides) : null,
        ),
        tail,
      ),
    );
  }

  private createTypeNode(
    typeName: string,
    typeState:
      | ObjectTypeState
      | EnumTypeState
      | ScalarTypeState
      | UnionTypeState
      | InterfaceTypeState
      | null,
  ) {
    if (this.typeNameToNodeIndexes.has(typeName)) {
      throw new Error(`Node for ${typeName} already exists in subgraph ${this.id}`);
    }

    return this.createNode(typeName, typeState, this.id, this.name);
  }

  private createNode(
    typeName: string,
    typeState:
      | ObjectTypeState
      | InterfaceTypeState
      | EnumTypeState
      | ScalarTypeState
      | UnionTypeState
      | null,
    graphId: string,
    graphName: string,
  ) {
    const index = this.nodesByTypeIndex.push([]) - 1;
    const node = new Node(index, typeName, typeState, graphId, graphName);
    this.nodesByTypeIndex[node.index].push(node);
    this.edgesByHeadTypeIndex.push([]);
    this.edgesByTailTypeIndex.push([]);
    this.typeChildren.push(new Set());

    const existing = this.typeNameToNodeIndexes.get(typeName);

    if (Array.isArray(existing)) {
      existing.push(index);
    } else {
      this.typeNameToNodeIndexes.set(typeName, [index]);
    }

    return node;
  }

  private addNode(node: Node) {
    const newIndex = this.nodesByTypeIndex.push([]) - 1;
    node.index = newIndex;

    this.nodesByTypeIndex[node.index].push(node);
    this.edgesByHeadTypeIndex.push([]);
    this.edgesByTailTypeIndex.push([]);
    this.typeChildren.push(new Set());

    const existing = this.typeNameToNodeIndexes.get(node.typeName);

    if (Array.isArray(existing)) {
      existing.push(newIndex);
    } else {
      this.typeNameToNodeIndexes.set(node.typeName, [newIndex]);
    }

    return node;
  }

  private addEdge(edge: Edge) {
    const edgeIndex = this.edgesByHeadTypeIndex[edge.head.index].push(edge) - 1;
    this.edgesByTailTypeIndex[edge.tail.index].push(edge);
    this.typeChildren[edge.head.index].add(edge.tail.typeName);

    if (isFieldEdge(edge)) {
      edge.head.addFieldEdge(edge.move.fieldName, edgeIndex);
    } else if (isEntityEdge(edge)) {
      edge.head.addEntityEdge(edge.head.typeName, edgeIndex);
    } else if (isAbstractEdge(edge)) {
      edge.head.addAbstractEdge(edge.head.typeName, edgeIndex);
    }

    if (edge.isCrossGraphEdge()) {
      edge.head.addCrossGraphEdge(edge.head.typeName, edgeIndex);
    }

    return edge;
  }

  private getIndexesOfType(typeName: string) {
    return this.typeNameToNodeIndexes.get(typeName);
  }

  private trueOrIfSubgraphThen(conditionFn: () => boolean) {
    if (this.isSubgraph) {
      return conditionFn();
    }

    return true;
  }

  private isSupergraph() {
    return this.isSubgraph === false;
  }
}
