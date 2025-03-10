import { 
    EmbeddedScene,
    SceneFlexLayout, 
    SceneFlexItem, 
    SceneQueryRunner,
    TextBoxVariable,
    SceneVariableSet,
    VariableValueSelectors,
    SceneVariables,
    PanelBuilders,
} from '@grafana/scenes';
import { createAlertNameVariable, createAlertSeverityVariable, createAlertStateVariable, createNamespaceVariable } from 'common/variableHelpers';
import { SortingState } from 'common/sortingHelpers';
import { AsyncTable, Column, ColumnSortingConfig, QueryBuilder } from 'components/AsyncTable';
import { TextColor } from 'common/types';
import { TableRow } from './types';
import { alertLabelValues } from './utils';
import { expandedRowSceneBuilder } from './AlertExpandedRow';
import { LabelFilters, serializeLabelFilters } from 'common/queryHelpers';
import { LegendDisplayMode, StackingMode } from '@grafana/ui';

interface SeverityColors {
    [key: string]: TextColor;
}

const KNOWN_SEVERITY_COLORS: SeverityColors  = {
    'critical': 'error',
    'high': 'warning',
    'warning': 'warning',
    'info': 'primary',
}

const columns: Array<Column<TableRow>> = [
    {
        id: 'alertname',
        header: 'ALERT NAME',
        accessor: (row: TableRow) => row.alertname,
        cellProps: {
            color: (row: TableRow) => KNOWN_SEVERITY_COLORS[row.severity],
        },
        sortingConfig: {
            enabled: true,
            type: 'label',
            local: true,
            compare: (a, b, direction) => {
                return direction === 'asc' ? a.alertname.localeCompare(b.alertname) : b.alertname.localeCompare(a.alertname);
            }
        },
    },
    {
        id: 'alertstate',
        header: 'STATE',
        accessor: (row: TableRow) => row.alertstate?.toLocaleUpperCase(),
        cellProps: {},
        sortingConfig: {
            enabled: true,
            type: 'label',
            local: true,
            compare: (a, b, direction) => {
                return direction === 'asc' ? a.alertstate.localeCompare(b.alertstate) : b.alertstate.localeCompare(a.alertstate);
            }
        },
    },
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
        id: 'spoke',
        header: 'CLUSTER',
        accessor: (row: TableRow) => row.spoke,
        sortingConfig: {
            enabled: true,
            type: 'label',
            local: true,
            compare: (a, b, direction) => {
                return direction === 'asc' ? a.spoke.localeCompare(b.spoke) : b.spoke.localeCompare(a.spoke);
            }
        },
    },
    {
        id: 'severity',
        header: 'SEVERITY',
        accessor: (row: TableRow) => row.severity?.toLocaleUpperCase(),
        cellProps: {
            color: (row: TableRow) => KNOWN_SEVERITY_COLORS[row.severity],
        },
        sortingConfig: {
            enabled: true,
            type: 'label',
            local: true,
            compare: (a, b, direction) => {
                return direction === 'asc' ? a.severity.localeCompare(b.severity) : b.severity.localeCompare(a.severity);
            }
        },
    },
    {
        id: 'Value',
        header: 'AGE',
        accessor: (row: TableRow) => Date.now()/1000 - row.Value,
        cellType: 'formatted',
        cellProps: {
            format: 'dtdurations'
        },
        sortingConfig: {
            enabled: true,
            type: 'value',
            local: true,
            compare: (a, b, direction) => {
                return direction === 'asc' ? a.Value - b.Value : b.Value - a.Value;
            }
        }
    }
]

function rowMapper(row: TableRow, asyncRowData: any) {

}

function createRowId(row: TableRow) {
    return alertLabelValues(row).join('/');
}

class AlertsQueryBuilder implements QueryBuilder<TableRow> {
    
    constructor(private labelFilters?: LabelFilters) {}
    
    rootQueryBuilder(variables: SceneVariableSet | SceneVariables, sorting: SortingState, sortingConfig?: ColumnSortingConfig<TableRow> | undefined) {

        const serializedFilters = this.labelFilters ? serializeLabelFilters(this.labelFilters) : '';
        const hasNamespaceVariable = variables.getByName('namespace') !== undefined;
        const hasSearchVariable = variables.getByName('alertSearch') !== undefined;
        const hasAlertStateVariable = variables.getByName('alertState') !== undefined;
        const hasAlertSeverityVariable = variables.getByName('alertSeverity') !== undefined;
        const hasAlertNameVariable = variables.getByName('alertName') !== undefined;

        const finalQuery = `
            ALERTS{
                spoke="$spoke",
                ${ hasSearchVariable ? `alertname=~"$alertSearch.*",`: '' }
                ${ hasAlertNameVariable ? `alertname=~"$alertName",` : '' }
                ${ hasNamespaceVariable ? `namespace=~"$namespace",` : '' }
                ${ hasAlertStateVariable ? `alertstate=~"$alertState",` : '' }
                ${ hasAlertSeverityVariable ? `severity=~"$alertSeverity",` : '' }
                ${serializedFilters}
            }
            * ignoring(alertstate) group_right(alertstate) ALERTS_FOR_STATE{
                spoke="$spoke",
                ${ hasNamespaceVariable ? `namespace=~"$namespace",` : '' }
                ${serializedFilters}
            }
        `

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

    rowQueryBuilder(rows: TableRow[], variables: SceneVariableSet | SceneVariables) {
        return []
    }
}

function alertsTimeseries() {
    return PanelBuilders.timeseries()
        .setTitle('Alerts')
        .setData(new SceneQueryRunner({
            datasource: {
                uid: '$datasource',
                type: 'prometheus',
            },
            queries: [
                {
                    refId: 'alerts',
                    expr: `
                        count(
                            ALERTS{
                                spoke="$spoke",
                                alertstate=~"$alertState",
                                alertname=~"$alertName",
                                severity=~"$alertSeverity",
                                namespace=~"$namespace",
                            }
                        ) by (alertname, namespace, alertstate)`,
                    legendFormat: '{{alertname}} [{{alertstate}}] - {{namespace}}',
                }
            ],
        }))
        .setOption('legend', { displayMode: LegendDisplayMode.Table, placement: 'right', calcs: ['mean', 'last', 'max'] })
        .setCustomFieldConfig('stacking', { mode: StackingMode.Normal })
        .setCustomFieldConfig('fillOpacity', 50)
        .build()
}

export function AlertsTable(labelFilters?: LabelFilters, showVariableControls = true, shouldCreateVariables = true) {

    const variables = new SceneVariableSet({
        variables: shouldCreateVariables ? [
            createNamespaceVariable(),
            createAlertNameVariable(),
            createAlertSeverityVariable(),
            createAlertStateVariable(),
            new TextBoxVariable({
                name: 'alertSearch',
                label: 'Search',
                value: '',
            }),
        ]: []
    })

    const controls = showVariableControls ? [
        new VariableValueSelectors({})
    ] : [];

    const defaultSorting: SortingState = {
        columnId: 'alertname',
        direction: 'asc'
    }

    const queryBuilder = new AlertsQueryBuilder(labelFilters);

    const table = new AsyncTable<TableRow>({
        columns: columns,
        createRowId: createRowId,
        asyncDataRowMapper: rowMapper,
        $data: queryBuilder.rootQueryBuilder(variables, defaultSorting),
        queryBuilder: queryBuilder,
        expandedRowBuilder: expandedRowSceneBuilder(createRowId),
        sorting: defaultSorting,
    })

    if (showVariableControls || shouldCreateVariables) {
        return new EmbeddedScene({
            $variables: variables,
            controls: controls,
            body: new SceneFlexLayout({
                direction: 'column',
                children: [
                    new SceneFlexItem({
                        height: 300,
                        body: alertsTimeseries(),
                    }),
                    new SceneFlexItem({
                        width: '100%',
                        body: table,
                    }),
                ],
            }),
        })
    } else {
        return table;
    }
}
