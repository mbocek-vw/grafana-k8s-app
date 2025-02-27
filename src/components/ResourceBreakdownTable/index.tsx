import { 
    EmbeddedScene,
    SceneFlexLayout, 
    SceneFlexItem, 
    SceneQueryRunner,
    SceneVariableSet,
    VariableValueSelectors,
    SceneVariables,
} from '@grafana/scenes';
import { getSeriesValue } from 'common/seriesHelpers';
import { createNamespaceVariable, resolveVariable } from 'common/variableHelpers';
import { Metrics } from 'metrics/metrics';
import { SortingState } from 'common/sortingHelpers';
import { AsyncTable, Column, ColumnSortingConfig, RowBase } from 'components/AsyncTable';

interface TableRow extends RowBase {
    spoke: string;
    namespace: string;
    cpu: {
        requests: number;
        limits: number;
        usage: number;
    };
    memory: {
        requests: number;
        limits: number;
        usage: number;
    };
}

const columns: Array<Column<TableRow>> = [
    {
        id: 'namespace',
        header: 'NAMESPACE',
        accessor: (row: TableRow) => row.namespace,
        sortingConfig: {
            enabled: true,
            type: 'label',
            local: true,
            compare: (a, b, direction) => {
                return direction === 'asc' ? a.namespace.localeCompare(b.namespace) : b.namespace.localeCompare(a.namespace);
            }
        },
    },
    {
        id: 'cpu',
        header: 'CPU',
        sortingConfig: {
            enabled: false,
        },
        columns: [
            {
                id: 'cpu_requested',
                header: 'REQUESTS',
                accessor: (row: TableRow) => row.cpu.requests,
                cellType: 'formatted',
                cellProps: {
                    decimals: 2,
                },
                sortingConfig: {
                    enabled: true,
                    type: 'value',
                    local: false
                }
            },
            {
                id: 'cpu_limits',
                header: 'LIMITS',
                accessor: (row: TableRow) => row.cpu.limits,
                cellType: 'formatted',
                cellProps: {
                    decimals: 2,
                },
                sortingConfig: {
                    enabled: true,
                    type: 'value',
                    local: false
                }
            },
            {
                id: 'cpu_usage',
                header: 'USAGE',
                accessor: (row: TableRow) => row.cpu.usage,
                cellType: 'formatted',
                cellProps: {
                    decimals: 5,
                },
                sortingConfig: {
                    enabled: true,
                    type: 'value',
                    local: false
                }
            },
        ]
    },
    {
        id: 'memory',
        header: 'MEMORY',
        sortingConfig: {
            enabled: false,
        },
        columns: [
            {
                id: 'memory_requested',
                header: 'REQUESTS',
                accessor: (row: TableRow) => row.memory.requests,
                cellType: 'formatted',
                cellProps: {
                    decimals: 2,
                    format: 'bytes',
                },
                sortingConfig: {
                    enabled: true,
                    type: 'value',
                    local: false
                }
            },
            {
                id: 'memory_limits',
                header: 'LIMITS',
                accessor: (row: TableRow) => row.memory.limits,
                cellType: 'formatted',
                cellProps: {
                    decimals: 2,
                    format: 'bytes',
                },
                sortingConfig: {
                    enabled: true,
                    type: 'value',
                    local: false
                }
            },
            {
                id: 'memory_usage',
                header: 'USAGE',
                accessor: (row: TableRow) => row.memory.usage,
                cellType: 'formatted',
                cellProps: {
                    decimals: 2,
                    format: 'bytes',
                },
                sortingConfig: {
                    enabled: true,
                    type: 'value',
                    local: false
                }
            }
        ]
    }
]

const serieMatcherPredicate = (row: TableRow) => (value: any) => value.namespace === row.namespace;

function rowMapper(row: TableRow, asyncRowData: any) {

    const cpuRequested = getSeriesValue(asyncRowData, 'cpu_requested', serieMatcherPredicate(row))
    const cpuUsage = getSeriesValue(asyncRowData, 'cpu_usage', serieMatcherPredicate(row))
    const cpuLimits = getSeriesValue(asyncRowData, 'cpu_limits', serieMatcherPredicate(row))

    row.cpu = {
        requests: cpuRequested,
        limits: cpuLimits,
        usage: cpuUsage,
    };

    const memoryRequested = getSeriesValue(asyncRowData, 'memory_requested', serieMatcherPredicate(row))
    const memoryUsage = getSeriesValue(asyncRowData, 'memory_usage', serieMatcherPredicate(row))
    const memoryLimits = getSeriesValue(asyncRowData, 'memory_limits', serieMatcherPredicate(row))

    row.memory = {
        requests: memoryRequested,
        limits: memoryLimits,
        usage: memoryUsage,
    };
}

function createRootQuery(sceneVariables: SceneVariableSet | SceneVariables, sorting?: SortingState, sortingConfig?: ColumnSortingConfig<TableRow>) {

    const baseQuery = `
        group(
            ${Metrics.kubeNamespaceStatusPhase.name}{
                ${Metrics.kubeNamespaceStatusPhase.labels.namespace}=~"$namespace",
                spoke="$spoke",
            }
        ) by (
            ${Metrics.kubeNamespaceStatusPhase.labels.namespace},
            spoke
        )`

    let sortQuery = undefined
    let sortFunction = undefined
    let groupStatement = `* on (${Metrics.kubeNamespaceStatusPhase.labels.namespace}) group_right()`

    if (sorting && sortingConfig && sortingConfig.local === false) {
        sortFunction = sorting.direction === 'desc' ? 'sort_desc' : 'sort';
        sortQuery = getQuery(sorting.columnId, '$spoke', '.*')
    }

    let finalQuery = baseQuery;
    if (sortQuery) {
        finalQuery = `
            ${sortFunction}(
                ${baseQuery}
                ${groupStatement}
                ${sortQuery}
            )
        `
    }

    return new SceneQueryRunner({
        datasource: {
            uid: '$datasource',
            type: 'prometheus',
        },
        queries: [
            {
                refId: 'namespaces',
                expr: finalQuery,
                instant: true,
                format: 'table'
            }
        ],
    });
}

function getQuery(name: string, spoke: string, ids: string) {
    switch (name) {
        case 'cpu_requested':
            return `
                sum(
                    ${Metrics.kubePodContainerResourceRequests.name}{
                        resource="cpu",
                        ${spoke ? `spoke=~"${spoke}"` : ''},
                        namespace=~"${ids}"
                    }
                ) by (spoke, namespace)
            `;
        case 'cpu_usage':
            return `sum(
                sum(
                    rate(
                        ${Metrics.containerCpuUsageSecondsTotal.name}{
                            ${Metrics.containerCpuUsageSecondsTotal.labels.container}!="",
                            namespace=~"${ids}",
                            ${spoke ? `spoke=~"${spoke}"` : ''},
                        }[$__rate_interval]
                    )
                ) by (
                    ${Metrics.containerCpuUsageSecondsTotal.labels.namespace},
                    ${Metrics.containerCpuUsageSecondsTotal.labels.pod},
                    ${Metrics.containerCpuUsageSecondsTotal.labels.container}
                )
            ) by (namespace, spoke)`
        case 'cpu_limits':
            return `
                sum(
                    ${Metrics.kubePodContainerResourceLimits.name}{
                        resource="cpu",
                        spoke=~"${spoke}",
                        namespace=~"${ids}"
                    }
                ) by (spoke, namespace)`
        case 'memory_requested':
            return  `
                sum(
                    ${Metrics.kubePodContainerResourceRequests.name}{
                        resource="memory",
                        spoke=~"${spoke}",
                        namespace=~"${ids}"
                    }
                ) by (spoke, namespace)`
        case 'memory_usage':
            return `
            sum(
                max(
                    ${Metrics.containerMemoryWorkingSetBytes.name}{
                        ${Metrics.containerMemoryWorkingSetBytes.labels.container}!="",
                        ${Metrics.containerMemoryWorkingSetBytes.labels.namespace}=~"${ids}",
                        spoke="${spoke}"
                    }
                ) by (
                    ${Metrics.containerMemoryWorkingSetBytes.labels.pod},
                    ${Metrics.containerMemoryWorkingSetBytes.labels.container},
                    ${Metrics.containerMemoryWorkingSetBytes.labels.namespace}
                )
            ) by (namespace, spoke)`
        case 'memory_limits':
            return `
                sum(
                    ${Metrics.kubePodContainerResourceLimits.name}{
                        resource="memory",
                        spoke=~"${spoke}",
                        namespace=~"${ids}"
                    }
                ) by (spoke, namespace)`
    }

    return undefined;
}

function createRowQueries(rows: TableRow[], sceneVariables: SceneVariableSet | SceneVariables) {

    const ids = rows.map((row: TableRow) => row.namespace).join('|');

    const spoke = resolveVariable(sceneVariables, 'spoke');
    const clusterValue = spoke?.toString() || '.*'

    return [
        {
            refId: 'cpu_requested',
            expr: getQuery('cpu_requested', clusterValue, ids),
            instant: true,
            format: 'table'
        },
        {
            refId: 'cpu_limits',
            expr: getQuery('cpu_limits', clusterValue, ids),
            instant: true,
            format: 'table'
        },
        {
            refId: 'cpu_usage',
            expr: getQuery('cpu_usage', clusterValue, ids),
            instant: true,
            format: 'table'
        },
        {
            refId: 'memory_requested',
            expr: getQuery('memory_requested', clusterValue, ids),
            instant: true,
            format: 'table'
        },
        {
            refId: 'memory_limits',
            expr: getQuery('memory_limits', clusterValue, ids),
            instant: true,
            format: 'table'
        },
        {
            refId: 'memory_usage',
            expr: getQuery('memory_usage', clusterValue, ids),
            instant: true,
            format: 'table'
        },
    ]
}

export const ResourceBreakdownTable = () => {

    const variables = new SceneVariableSet({
        variables: [
            createNamespaceVariable(),
        ]
    });

    const defaultSorting: SortingState = {
        columnId: 'namespace',
        direction: 'asc'
    }

    return new EmbeddedScene({
        $variables: variables,
        controls: [
            new VariableValueSelectors({})
        ],
        body: new SceneFlexLayout({
            children: [
                new SceneFlexItem({
                    width: '100%',
                    height: '100%',
                    body: new AsyncTable<TableRow>({
                        columns: columns,
                        createRowId: (row) => `${row.namespace}:${row.spoke}`,
                        asyncDataRowMapper: rowMapper,
                        $data: createRootQuery(variables, defaultSorting),
                        queryBuilder: {
                            rowQueryBuilder: createRowQueries,
                            rootQueryBuilder: createRootQuery,
                        },
                        sorting: defaultSorting,
                    }),
                }),
            ],
        }),
    })
}
